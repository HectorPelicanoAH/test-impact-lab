import { correlateMesh, observationsHash } from './mesh';
import { readCollector, correlate, validateDataset, type ObservationDataset } from './observations';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { validateGraph } from '../../packages/impact-engine/src/index';
import type { GraphEdge, GraphNode, ImpactGraph, TestMetadata } from '../../packages/impact-engine/src/schema';
import type { DiscoveryArchive, DiscoveryConfig, GraphSnapshotV2, MeshDataset, SourceFiles } from '../../packages/impact-engine/src/schema-v2';
import { GraphBuilder, canonical, fileHashes, hash, nodeId, ordered, validateSnapshot } from './core';
import { authorizedPath, inventory, readTree, safePath } from './files';
import { indexTypescript, location, parseSource } from './extract';
import { externalTests, extractExternalRepository, extractInventoryHttp, inventoryPrefix } from './inventory-http';
import { extractMessaging } from './messaging';

export const executionEntries = ['apps', 'packages', 'tests', 'scripts', 'impact', 'patches', 'examples/external-inventory', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts'];
export const ignoreExecution = (path: string) => path.split('/').some(segment => ['node_modules', 'dist', 'dist-server', '__pycache__'].includes(segment) || segment.startsWith('.'));
export interface WorkspaceInput {
  sources: SourceFiles; configuration: SourceFiles; config: DiscoveryConfig; executionFiles: SourceFiles;
  legacyGraph: ImpactGraph; catalogue: TestMetadata[];
  inventoryRevision?: string; meshDataset?: MeshDataset; observationDataset?: ObservationDataset;
}
export function loadWorkspace(root: string, inventoryRoot = process.env.INVENTORY_ROOT): WorkspaceInput {
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const config = JSON.parse(read('impact/discovery.json')) as DiscoveryConfig;
  if (!config.productId || !config.repositoryId || !Array.isArray(config.roots) || !config.roots.length
    || !config.roots.every(safePath) || !Number.isInteger(config.maxFiles) || config.maxFiles < 1 || config.maxFiles > 5000
    || !Number.isInteger(config.maxFileBytes) || config.maxFileBytes < 1 || config.maxFileBytes > 2_000_000) throw new Error('Invalid discovery roots or resource limits.');
  const legacyGraph = JSON.parse(read('impact/graph.json')) as ImpactGraph;
  const catalogue = JSON.parse(read('impact/catalogue.json')) as TestMetadata[];
  validateGraph(legacyGraph, catalogue);
  const sources = inventory(root, config);
  for (const test of catalogue) sources[test.file] = read(test.file);
  const configuration = Object.fromEntries(['impact/discovery.json', 'impact/inventory-binding.json', 'impact/evidence/architecture.json', 'impact/evidence/federated-tests.json', 'impact/graph.json', 'impact/catalogue.json', 'tsconfig.json', 'package.json', 'pnpm-lock.yaml']
    .map(path => [path, read(path)]));
  const executionFiles = readTree(root, executionEntries, ignoreExecution);
  let inventoryRevision: string | undefined;
  if (inventoryRoot) {
    const externalRoot = realpathSync(resolve(inventoryRoot));
    if (externalRoot === resolve(root) || externalRoot.startsWith(`${resolve(root)}/`)) throw new Error('External inventory cannot be located inside this checkout.');
    const external = readTree(externalRoot, ['src', 'contract', 'test', 'package.json']);
    const dirty = execFileSync('git', ['-C', externalRoot, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
    if (realpathSync(execFileSync('git', ['-C', externalRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()) !== externalRoot) throw new Error('Inventory root must be its own Git repository.');
    if (dirty.trim()) throw new Error('External inventory revision has uncommitted or untracked source. Commit changes to pin a revision.');
    inventoryRevision = execFileSync('git', ['-C', externalRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(inventoryRevision)) throw new Error('Invalid inventory Git revision.');
    for (const [path, content] of Object.entries(external)) {
      const virtualPath = `${inventoryPrefix}${path}`;
      executionFiles[virtualPath] = content;
      if (path.startsWith('src/') || path.startsWith('contract/') || path.startsWith('test/')) sources[virtualPath] = content;
      if (path === 'package.json') configuration[virtualPath] = content;
    }
  }
  const observationDataset = process.env.OTEL_COLLECTOR_PATH ? readCollector(readFileSync(resolve(process.env.OTEL_COLLECTOR_PATH), 'utf8').split('\n').slice(0, -1).join('\n')) : process.env.OTEL_DATASET_PATH ? JSON.parse(readFileSync(resolve(process.env.OTEL_DATASET_PATH), 'utf8')) as ObservationDataset : undefined;
  const meshDataset = process.env.MESH_DATASET_PATH ? JSON.parse(readFileSync(resolve(process.env.MESH_DATASET_PATH), 'utf8')) as MeshDataset : undefined;
  return { ...(meshDataset ? { meshDataset } : {}), sources, configuration, config, legacyGraph, catalogue, executionFiles, ...(observationDataset ? { observationDataset } : {}), ...(inventoryRevision ? { inventoryRevision } : {}) };
}

interface ReviewedMetadata {
  nodes: { id: string; path: string; symbol?: string }[];
  relationships: { from: string; to: string; type: string; source: string; reason: string }[];
  tests: { id: string; exercises: string[] }[];
}
function migrate(builder: GraphBuilder, input: WorkspaceInput) {
  const metadataPath = 'impact/evidence/architecture.json';
  const metadata = JSON.parse(input.configuration[metadataPath]!) as ReviewedMetadata;
  const map = new Map<string, string>();
  const nativeEdges = [...builder.edges.values()];
  const legacyNodes = new Map(input.legacyGraph.nodes.map(node => [node.id, node]));
  for (const old of input.legacyGraph.nodes) {
    const declaration = metadata.nodes.find(node => node.id === old.id);
    const test = input.catalogue.find(test => test.nodeId === old.id);
    const path = declaration?.path ?? test?.file;
    const content = path ? input.sources[path] : undefined;
    const source = content === undefined || !path ? undefined : parseSource(path, content);
    let sourceNode: ts.Node | undefined = source;
    if (source && declaration?.symbol) {
      const matches: ts.Node[] = [];
      const [name, member] = declaration.symbol.split('.');
      function visit(node: ts.Node) {
        if (member && ts.isClassDeclaration(node) && node.name?.text === name) matches.push(...node.members.filter(item => member === 'constructor' ? ts.isConstructorDeclaration(item) : 'name' in item && item.name?.getText(source) === member));
        if (!member && 'name' in node && (node as ts.NamedDeclaration).name?.getText(source) === name) matches.push(node);
        ts.forEachChild(node, visit);
      }
      visit(source);
      sourceNode = matches.length === 1 ? matches[0] : undefined;
    }
    if (source && test) {
      sourceNode = source.statements.find(item => ts.isExpressionStatement(item) && ts.isCallExpression(item.expression)
        && ts.isIdentifier(item.expression.expression) && ['test', 'it'].includes(item.expression.expression.text)
        && item.expression.arguments[0] && ts.isStringLiteral(item.expression.arguments[0]) && item.expression.arguments[0].text === test.title);
    }
    const loc = source && sourceNode ? location(source, sourceNode) : undefined;
    if (!loc) builder.diagnostic('legacy-unverified', `Cannot revalidate legacy source for ${old.id}.`);
    const id = builder.node(old.kind === 'test' ? 'test' : old.kind === 'contract' ? 'http-contract' : 'reviewed-anchor', old.id, old.label,
      loc ? [loc] : [], { side: old.side, layer: old.layer, changeable: old.changeable !== false, ...(path ? { path } : {}), ...(old.testId ? { testId: old.testId } : {}) }, old.id);
    map.set(old.id, id);
  }
  for (const old of input.legacyGraph.edges) {
    const from = map.get(old.from)!, to = map.get(old.to)!;
    const policyRef = `legacy:${hash(old.policy)}`;
    builder.policies.set(policyRef, { id: policyRef, version: '1', kind: 'legacy-login-v1', configuration: old.policy });
    if (old.evidence.kind === 'static' && old.type === 'imports') {
      const fromPath = legacyNodes.get(old.from)?.source?.path, toPath = legacyNodes.get(old.to)?.source?.path;
      const matches = nativeEdges.filter(edge => edge.type === 'imports' && edge.from === nodeId(builder.config, 'file', fromPath ?? '') && edge.to === nodeId(builder.config, 'file', toPath ?? ''));
      if (!matches.length) { builder.diagnostic('legacy-unverified', `Legacy import no longer resolves: ${old.id}`); continue; }
      for (const edge of matches) for (const evidenceId of edge.evidenceIds) {
        const evidence = builder.evidence.get(evidenceId)!;
        builder.edge('imports', from, to, evidence.locator, evidence.reason, { qualifiers: { legacyId: old.id }, policyRef });
      }
    } else {
      let pointer: string | undefined;
      if (old.type === 'exercises') {
        const testIndex = metadata.tests.findIndex(test => `test:${test.id}` === old.from);
        const subject = metadata.tests[testIndex]?.exercises.indexOf(old.to) ?? -1;
        if (testIndex >= 0 && subject >= 0) pointer = `/tests/${testIndex}/exercises/${subject}`;
      } else {
        const index = metadata.relationships.findIndex(item => item.from === old.from && item.to === old.to && item.type === old.type);
        if (index >= 0) pointer = `/relationships/${index}`;
      }
      if (!pointer || input.sources[old.evidence.source] === undefined || !builder.nodes.get(from)?.locations.length || !builder.nodes.get(to)?.locations.length) {
        builder.diagnostic('legacy-unverified', `Missing reviewed declaration/source: ${old.id}`);
        continue;
      }
      builder.edge(old.type, from, to, { kind: 'declaration', path: metadataPath, sourceHash: hash(input.configuration[metadataPath]!), pointer, relatedSource: old.evidence.source },
        old.evidence.reason, { qualifiers: { legacyId: old.id }, policyRef, kind: 'reviewed-declaration', extractor: 'reviewed-login-migration' });
    }
  }
}

export interface DiscoveryPhase { id: string; title: string; technology: string; explanation: string }
export const discoveryPhases: DiscoveryPhase[] = [
  { id: 'sources', title: 'Fijar las fuentes', technology: 'Node.js · Git · SHA-256', explanation: 'Fijamos archivos, configuración y revisiones. Leer una fuente todavía no demuestra una conexión.' },
  { id: 'symbols', title: 'Descubrir archivos y símbolos', technology: `TypeScript Compiler API ${ts.version} · AST`, explanation: 'El compilador identifica archivos y declaraciones: funciones, clases e interfaces. Cada nodo conserva su fuente.' },
  { id: 'imports', title: 'Resolver imports', technology: 'TypeScript · resolveModuleName', explanation: 'Resolvemos cada import a su módulo concreto. Las flechas resaltadas muestran consumidor → dependencia.' },
  { id: 'behavior', title: 'Resolver comportamiento', technology: 'TypeScript · TypeChecker', explanation: 'Resolvemos llamadas, JSX e interfaces a declaraciones concretas. Un destino ambiguo queda diagnosticado.' },
  { id: 'reviewed', title: 'Vincular arquitectura y tests', technology: 'Adaptador propio · AST + JSON revisado', explanation: 'Revalidamos las piezas del login y los sujetos declarados de sus tests. Esto expresa intención, no cobertura medida.' },
  { id: 'external', title: 'Incorporar proveedor externo', technology: 'Git · adaptador TypeScript', explanation: 'Leemos código y tests de la revisión fijada de Inventory. Sin fuente, informamos contract-only.' },
  { id: 'http', title: 'Conectar HTTP', technology: 'Adaptador HTTP propio · AST + contratos JSON', explanation: 'Comprobamos cliente, método, endpoint y versión del contrato. Una coincidencia incompleta no crea un binding.' },
  { id: 'messaging', title: 'Conectar eventos y consumidores', technology: 'Adaptador AMQP propio · AST + topología JSON', explanation: 'Relacionamos publicador, canal, colas y handlers desde código y registros explícitos. No consultamos el broker.' },
  { id: 'observations', title: 'Incorporar observaciones', technology: 'OpenTelemetry / OTLP · correlación versionada', explanation: 'Correlacionamos capturas disponibles con su revisión y ventana. La ausencia de tráfico no elimina dependencias estáticas.' },
  { id: 'validation', title: 'Validar y publicar', technology: 'Validadores propios · SHA-256', explanation: 'Verificamos referencias, evidencias y bytes archivados. Solo un grafo completo y válido habilita el impacto.' },
];

/** Paused between phases: no extractor runs until next() is explicitly called. */
export function createDiscoveryPipeline(input: WorkspaceInput) {
  const executionFiles = { ...input.executionFiles };
  for (const path of Object.keys(executionFiles)) if (authorizedPath(path, input.config) && input.sources[path] === undefined) delete executionFiles[path];
  Object.assign(executionFiles, input.sources);
  const configuration = { ...input.configuration };
  // Capture every runner input, including helper code and tool versions, without volatile filesystem paths.
  configuration['execution-manifest.json'] = JSON.stringify(fileHashes(executionFiles));
  const extractors = { typescript: ts.version, adapter: '2', migration: '2', implementation: fileHashes(Object.fromEntries(Object.entries(executionFiles).filter(([path]) => path.startsWith('scripts/graph/') || path.endsWith('schema-v2.ts')))) };
  configuration['extractor-manifest.json'] = JSON.stringify(extractors);
  const localSources = Object.fromEntries(Object.entries(input.sources).filter(([path]) => !path.startsWith(inventoryPrefix)));
  const builder = new GraphBuilder(input.sources, input.config, configuration, `content:${hash(fileHashes(localSources))}`);
  let compiler: ReturnType<typeof indexTypescript> | undefined;
  let observations: GraphSnapshotV2['observations'] = [], mesh: GraphSnapshotV2['mesh'];
  let observationsReady = false, completed = 0, published: DiscoveryArchive | undefined;
  function assemble(): DiscoveryArchive {
  const externalSources = Object.fromEntries(Object.entries(input.sources).filter(([path]) => path.startsWith(inventoryPrefix)));
  const externalCatalogue = externalTests(input.sources);
  const localContract = input.sources['packages/api-contract/src/inventory-contract.json'];
  const body: Omit<GraphSnapshotV2, 'id'> = {
    schemaVersion: 2, repositories: [
      { ...builder.repository, revision: builder.revision, sourceSetHash: hash(fileHashes(localSources)), availability: 'local', roots: [...input.config.roots].sort(), exclusions: [...input.config.exclusions].sort() },
      { productId: 'inventory', repositoryId: 'external-inventory', revision: input.inventoryRevision ?? `contract:${hash(localContract)}`,
        sourceSetHash: hash(fileHashes(externalSources)), availability: input.inventoryRevision ? 'local' : 'contract-only',
        roots: ['external/inventory/src'], exclusions: ['**/*.test.ts', '**/*.spec.ts'] },
    ],
    inputs: { sourcesHash: hash(fileHashes(input.sources)), contractsHash: hash(fileHashes(Object.fromEntries(Object.entries(input.sources).filter(([path]) => path.startsWith('packages/api-contract/'))))),
      configurationHash: builder.configurationHash, catalogueHash: hash({ local: input.catalogue, external: externalCatalogue }), extractorsHash: hash(extractors),
      policiesHash: hash(ordered(builder.policies.values())), observationsHash: null },
    nodes: ordered(builder.nodes.values()), edges: ordered(builder.edges.values()), evidence: ordered(builder.evidence.values()), diagnostics: ordered(builder.diagnostics.values()), policies: ordered(builder.policies.values()), observations,
    ...(mesh ? { mesh } : {}),
  };
  body.inputs.observationsHash = observationsReady ? observationsHash(input.observationDataset, input.meshDataset) : null;
  const graph: GraphSnapshotV2 = { ...body, id: hash(body) };
  const archive = { graph, sources: input.sources, configuration, executionFiles, config: input.config, catalogue: input.catalogue, externalCatalogue, legacyGraph: input.legacyGraph,
    ...(input.meshDataset ? { meshDataset: input.meshDataset } : {}),
    ...(input.observationDataset ? { observationDataset: input.observationDataset } : {}),
    ...(input.inventoryRevision ? { inventoryRevision: input.inventoryRevision } : {}) };
  return archive;
  }
  const actions = [
    () => { /* Immutable inputs captured by the caller, no extraction. */ },
    () => { compiler = indexTypescript(builder); },
    () => { if (!compiler) throw new Error('Index declarations first.'); compiler.resolveImports(); },
    () => { if (!compiler) throw new Error('Index declarations first.'); compiler.resolveBehavior(); },
    () => migrate(builder, input),
    () => { if (input.inventoryRevision) extractExternalRepository(builder, input.sources, configuration, input.inventoryRevision); },
    () => extractInventoryHttp(builder, input.sources, input.config, input.inventoryRevision),
    () => extractMessaging(builder),
    () => {
      const view = assemble().graph;
      if (input.observationDataset) observations = correlate(input.observationDataset, view);
      if (input.meshDataset) mesh = correlateMesh(input.meshDataset, view);
      observationsReady = true;
    },
    () => { const archive = assemble(); validateArchive(archive); published = archive; },
  ];
  return {
    get completed() { return completed; },
    get archive() { return published; },
    get nextPhase() { return discoveryPhases[completed]; },
    partial(reference: string): DiscoveryArchive {
      const archive = assemble();
      return { ...archive, graph: { ...archive.graph, id: reference } };
    },
    next() {
      const action = actions[completed];
      if (!action) throw new Error('All discovery phases are complete.');
      // Restore both facts and execution context on failure, never just the canvas.
      const checkpoint = structuredClone({ nodes: builder.nodes, edges: builder.edges, evidence: builder.evidence, diagnostics: builder.diagnostics, policies: builder.policies });
      const oldCompiler = compiler, oldObservations = observations, oldMesh = mesh, oldReady = observationsReady;
      try { action(); completed++; }
      catch (error) {
        Object.assign(builder, checkpoint); compiler = oldCompiler; observations = oldObservations; mesh = oldMesh; observationsReady = oldReady;
        throw error;
      }
    },
  };
}

export function buildArchive(input: WorkspaceInput): DiscoveryArchive {
  const pipeline = createDiscoveryPipeline(input);
  while (pipeline.nextPhase) pipeline.next();
  return pipeline.archive!;
}

export function validateArchive(archive: DiscoveryArchive) {
  const { graph, sources, configuration, executionFiles } = archive;
  validateSnapshot(graph, sources, configuration);
  if (archive.observationDataset) {
    validateDataset(archive.observationDataset);
    if (graph.inputs.observationsHash !== observationsHash(archive.observationDataset, archive.meshDataset) || canonical(graph.observations) !== canonical(correlate(archive.observationDataset, graph))) throw new Error('Observation dataset/correlation mismatch');
  } else if ((!archive.meshDataset && graph.inputs.observationsHash !== null) || graph.observations.length) throw new Error('Missing archived observation dataset');
  if (graph.inputs.observationsHash !== observationsHash(archive.observationDataset, archive.meshDataset)) throw new Error('Observation input hash mismatch');
  if (archive.meshDataset) { if (canonical(graph.mesh) !== canonical(correlateMesh(archive.meshDataset, graph))) throw new Error('Mesh dataset/correlation mismatch'); }
  else if (graph.mesh) throw new Error('Missing archived mesh dataset');
  for (const [path, value] of [['impact/discovery.json', archive.config], ['impact/catalogue.json', archive.catalogue], ['impact/graph.json', archive.legacyGraph]] as const) {
    if (canonical(value) !== canonical(JSON.parse(configuration[path]!))) throw new Error(`Archive manifest mismatch: ${path}`);
  }
  if (hash(fileHashes(executionFiles)) !== hash(JSON.parse(configuration['execution-manifest.json']!))) throw new Error('Execution input manifest mismatch.');
  if (graph.repositories.some(repo => repo.productId === 'inventory') && canonical(archive.externalCatalogue) !== canonical(externalTests(sources))) throw new Error('External catalogue differs from archived source.');
  for (const [path, content] of Object.entries({ ...sources, ...configuration })) {
    if (['execution-manifest.json', 'extractor-manifest.json'].includes(path)) continue;
    if (executionFiles[path] !== content) throw new Error(`Captured execution bytes differ from analyzed input: ${path}`);
  }
}

/** Compatibility view only. Native v2 relations remain available in full in archive.graph. */
export function compatibilityGraph(archive: DiscoveryArchive): ImpactGraph {
  const { graph, legacyGraph } = archive;
  const knownPaths = new Set(legacyGraph.nodes.flatMap(node => node.source ? [node.source.path] : []));
  const nodes: GraphNode[] = graph.nodes.filter(node => node.legacyId).map(node => {
    const old = legacyGraph.nodes.find(item => item.id === node.legacyId)!;
    const loc = node.locations[0];
    return { ...old, ...(loc ? { source: { path: loc.path, startLine: loc.start.line, endLine: loc.end.line } } : { source: undefined }) };
  });
  const mapping = new Map(graph.nodes.filter(node => node.legacyId).map(node => [node.id, node.legacyId!]));
  for (const node of graph.nodes.filter(node => !node.legacyId)) {
    const path = node.locations[0]?.path;
    const old = legacyGraph.nodes.find(node => node.kind !== 'test' && node.source?.path === path);
    if (old) mapping.set(node.id, old.id);
    else if (path && !knownPaths.has(path)) {
      mapping.set(node.id, node.id);
      nodes.push({ id: node.id, label: node.label, kind: 'entity', side: path.startsWith('apps/backend') ? 'backend' : path.startsWith('apps/frontend') ? 'frontend' : 'shared', layer: 'Discovered code', source: { path, startLine: node.locations[0]!.start.line, endLine: node.locations[0]!.end.line } });
    }
  }
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    const from = mapping.get(edge.from), to = mapping.get(edge.to);
    if (!from || !to || from === to) continue;
    const old = legacyGraph.edges.find(item => item.id === edge.qualifiers.legacyId);
    if (old) { edges.push({ ...old }); continue; }
    // New relationships are displayed; uncertainty policies are handled by analysis, not guessed traversal rules.
    if (!['imports', 'calls', 'renders', 'implements', 'contains', 'routes', 'realizes'].includes(edge.type)
      || (legacyGraph.nodes.some(node => node.id === from) && legacyGraph.nodes.some(node => node.id === to))) continue;
    const proof = graph.evidence.find(item => item.id === edge.evidenceIds[0])!;
    edges.push({ id: edge.id, from, to, type: edge.type as GraphEdge['type'],
      evidence: { kind: 'static', source: 'path' in proof.locator ? proof.locator.path : 'snapshot', reason: proof.reason },
      policy: { reverseImpact: false, forwardBoundaryEvidence: false, contractExposure: false } });
  }
  return { schemaVersion: 1, nodes: ordered(nodes), edges: ordered(edges) };
}
