import { readFileSync, writeFileSync } from 'node:fs';
import metadata from '../impact/evidence/architecture.json';
import { validateGraph } from '../packages/impact-engine/src/index';
import type { GraphEdge, GraphNode, ImpactGraph, Side, TestKind, TestMetadata } from '../packages/impact-engine/src/schema';
import { filesUnder, moduleReferences, resolveModule, sourceFile, symbolRange, testTitles } from './source-analysis';

const nodes: GraphNode[] = metadata.nodes.map(node => ({
  id: node.id, label: node.id, kind: node.kind as GraphNode['kind'], side: node.side as Side, layer: node.layer,
  source: { path: node.path, ...('symbol' in node && node.symbol ? symbolRange(node.path, node.symbol) : { startLine: 1, endLine: readFileSync(node.path, 'utf8').split('\n').length }) },
  changeable: 'changeable' in node ? node.changeable : true,
}));
const catalogue: TestMetadata[] = metadata.tests.map(test => {
  const titles = testTitles(test.file).filter(title => title.startsWith(`[${test.id}] `));
  if (titles.length !== 1) throw new Error(`Expected one literal top-level test for ${test.id}`);
  const title = titles[0]!;
  const nodeId = `test:${test.id}`;
  nodes.push({ id: nodeId, label: title, kind: 'test', side: test.kind === 'contract' ? 'boundary' : ['e2e', 'component', 'frontend-unit'].includes(test.kind) ? 'frontend' : 'backend', layer: test.kind, testId: test.id });
  return { id: test.id, name: title, kind: test.kind as TestKind, nodeId, runner: test.kind === 'e2e' ? 'playwright' : 'vitest', file: test.file, title };
});

// Every product test must be catalogued; quality/architecture/engine checks live elsewhere.
const productFiles = ['apps/backend/src', 'apps/frontend/src', 'tests/contract', 'tests/integration', 'tests/e2e'].flatMap(filesUnder).filter(path => /\.(test|spec)\.tsx?$/.test(path));
for (const path of productFiles) {
  for (const title of testTitles(path)) {
    if (catalogue.filter(test => test.file === path && test.title === title).length !== 1) throw new Error(`Uncatalogued product test: ${path}: ${title}`);
  }
}

const edges: GraphEdge[] = [];
function add(from: string, to: string, type: GraphEdge['type'], kind: GraphEdge['evidence']['kind'], source: string, reason: string) {
  const override = metadata.policies.find(policy => policy.from === from && policy.to === to);
  edges.push({ id: `${type}:${from}->${to}`, from, to, type, evidence: { kind, source, reason }, policy: {
    reverseImpact: override && 'reverseImpact' in override ? (override.reverseImpact ?? true) : true,
    forwardBoundaryEvidence: override?.forwardBoundaryEvidence ?? false,
    contractExposure: override?.contractExposure ?? false,
  } });
}
for (const node of metadata.nodes) {
  if ('analyzeImports' in node && node.analyzeImports === false) continue;
  for (const specifier of moduleReferences(sourceFile(node.path))) {
    const targetPath = resolveModule(specifier, node.path);
    const target = metadata.nodes.find(candidate => candidate.path === targetPath);
    if (target) add(node.id, target.id, 'imports', 'static', node.path, `TypeScript module reference ${specifier} resolves to ${targetPath}.`);
    else if (specifier.startsWith('.') || specifier.startsWith('@test-impact/')) throw new Error(`Unmapped dependency ${node.path}: ${specifier}`);
  }
}
for (const relation of metadata.relationships) add(relation.from, relation.to, relation.type as GraphEdge['type'], 'architecture', relation.source, relation.reason);
for (const test of metadata.tests) {
  for (const entity of test.exercises) add(`test:${test.id}`, entity, 'exercises', test.kind === 'contract' ? 'contract' : 'test-coverage', test.file,
    `Reviewed local subject of [${test.id}]; explicit metadata, not measured runtime coverage.`);
}
for (const policy of metadata.policies) {
  if (!edges.some(edge => edge.from === policy.from && edge.to === policy.to)) throw new Error(`Policy without relationship: ${policy.from} -> ${policy.to}`);
}
const order = <T extends { id: string }>(items: T[]) => items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const graph: ImpactGraph = { schemaVersion: 1, nodes: order(nodes), edges: order(edges) };
order(catalogue);
validateGraph(graph, catalogue);
for (const [path, data] of [['impact/graph.json', graph], ['impact/catalogue.json', catalogue]] as const) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== serialized) throw new Error(`Stale ${path}; run pnpm graph:generate`);
  } else writeFileSync(path, serialized);
}
console.log(`Graph validated: ${nodes.length} nodes, ${edges.length} evidenced edges, ${catalogue.length} real tests.`);
