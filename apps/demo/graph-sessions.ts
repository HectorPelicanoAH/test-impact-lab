import { randomUUID } from 'node:crypto';
import { canonical, delta, fileHashes, hash } from '../../scripts/graph/core';
import { createDiscoveryPipeline, discoveryPhases, type DiscoveryPhase, type WorkspaceInput } from '../../scripts/graph/snapshot';
import { analyzePrepared } from '../../scripts/graph/analyze';
import { applyEdits } from '../../scripts/graph/files';
import { locateSource } from '../../scripts/graph/locator';
import { calculateFederatedImpact, readFederatedSuites } from '../../packages/impact-engine/src/federated';
import type { DiscoveryArchive, OverlayEdit } from '../../packages/impact-engine/src/schema-v2';
import type { DemoAnalysis, DemoGraphSession, GraphStepResult } from './src/types';

export const inputIdentity = (input: WorkspaceInput) => hash({ sources: fileHashes(input.sources), configuration: fileHashes(input.configuration), execution: fileHashes(input.executionFiles), revision: input.inventoryRevision ?? null });
const impactPhases: DiscoveryPhase[] = [
  { id: 'diff', title: 'Comparar fuentes', technology: 'Comparación de bytes · overlay aislado', explanation: 'Fijamos las altas, modificaciones y bajas frente al grafo base. Los tests todavía no están seleccionados.' },
  ...discoveryPhases,
  { id: 'delta', title: 'Comparar grafos completos', technology: 'Delta de snapshots · motor propio', explanation: 'Confirmamos nodos y conexiones añadidos, cambiados o retirados, conservando su evidencia anterior.' },
  { id: 'impact', title: 'Recorrer impacto local', technology: 'Motor TypeScript propio · políticas de contratos', explanation: 'Calculamos el impacto sobre ambos grafos. La incertidumbre puede exigir todos los tests locales; en ese caso no inventamos caminos.' },
  { id: 'selection', title: 'Seleccionar suites y explicar el resultado', technology: 'Motor federado propio · catálogo revisado', explanation: 'Completamos las decisiones locales y distribuidas y explicamos su disponibilidad. Seleccionar no ejecuta los tests.' },
];
interface Session {
  id: string; kind: DemoGraphSession['kind']; input: WorkspaceInput; inputId: string; status: DemoGraphSession['status'];
  pipeline: ReturnType<typeof createDiscoveryPipeline>; phases: DiscoveryPhase[]; history: { archive: DiscoveryArchive; step: GraphStepResult; localImpact?: DemoAnalysis['result'] }[];
  before?: Session; edits: OverlayEdit[]; local?: ReturnType<typeof analyzePrepared>; analysis?: DemoAnalysis; error?: string;
  requests: Map<string, number>;
}

/** Retains extraction context across commands, not a prerecorded graph animation. */
export class GraphSessions {
  private sessions = new Map<string, Session>();
  private inputs = new Map<string, WorkspaceInput>();
  constructor(private load: () => WorkspaceInput,
    private publish: (archive: DiscoveryArchive) => void,
    private completed: (analysis: DemoAnalysis, edits: OverlayEdit[], after: DiscoveryArchive) => void) {}
  capture() {
    const input = structuredClone(this.load()), id = inputIdentity(input);
    this.inputs.set(id, input);
    while (this.inputs.size > 4) this.inputs.delete(this.inputs.keys().next().value!);
    return { input, id };
  }
  start(body: { kind: 'discovery' | 'impact'; inputId: string; baseSessionId?: string; edits?: OverlayEdit[] }) {
    const input = this.inputs.get(body.inputId);
    if (!input || inputIdentity(this.load()) !== body.inputId) throw new Error('Las fuentes han cambiado. Recarga el editor.');
    const before = body.baseSessionId ? this.get(body.baseSessionId) : undefined;
    if (body.kind === 'impact' && (!before || before.kind !== 'discovery' || before.status !== 'completed' || before.inputId !== body.inputId)) throw new Error('Construye un grafo base válido antes de analizar el impacto.');
    const edits = structuredClone(body.edits ?? []);
    if (body.kind === 'impact') applyEdits(input.sources, edits, input.config);
    const session: Session = { id: randomUUID(), kind: body.kind, input, inputId: body.inputId, status: 'waiting', pipeline: createDiscoveryPipeline(input),
      phases: body.kind === 'impact' ? impactPhases : discoveryPhases, history: [], edits, before, requests: new Map() };
    // Never evict an active session or the baseline of an existing analysis.
    if (this.sessions.size >= 8) {
      const referenced = new Set([...this.sessions.values()].flatMap(item => item.before ? [item.before.id] : []));
      const old = [...this.sessions.values()].find(item => ['completed', 'cancelled', 'stale'].includes(item.status) && !referenced.has(item.id));
      if (!old) throw new Error('Demasiadas sesiones activas. Reinicia el proceso de demo.');
      this.sessions.delete(old.id);
    }
    this.sessions.set(session.id, session);
    return this.view(session.id);
  }
  private get(id: string) { const session = this.sessions.get(id); if (!session) throw new Error('Sesión no disponible.'); return session; }
  view(id: string, sequence?: number): DemoGraphSession {
    const session = this.get(id), record = sequence === undefined ? session.history.at(-1) : session.history[sequence - 1];
    if (sequence !== undefined && (!Number.isInteger(sequence) || sequence < 1 || !record)) throw new Error('Paso no disponible.');
    return { id, inputId: session.inputId, kind: session.kind, status: session.status, sequence: session.history.length, total: session.phases.length,
      nextPhase: session.phases[session.history.length], step: record?.step, steps: session.history.map(item => item.step),
      graph: record?.archive.graph ?? session.pipeline.partial(`partial:${id}:0`).graph,
      changedPaths: session.kind === 'impact' && record ? session.edits.map(edit => edit.path) : [], localImpact: record?.localImpact,
      layoutLayers: Object.fromEntries(session.input.legacyGraph.nodes.filter(node => node.source).map(node => [node.source!.path, node.layer])),
      beforeGraph: session.before?.pipeline.archive?.graph, snapshotId: session.pipeline.archive?.graph.id,
      analysis: record?.step.sequence === session.history.length ? session.analysis : undefined, error: session.error };
  }
  next(id: string, expected: number, key: string) {
    const session = this.get(id);
    const previous = session.requests.get(key);
    if (previous !== undefined) {
      if (previous !== expected) throw new Error('Clave de idempotencia reutilizada con otra secuencia.');
      return this.view(id);
    }
    if (session.status !== 'waiting' && session.status !== 'error') throw new Error('La sesión no admite ejecutar otra fase.');
    if (expected !== session.history.length) throw new Error('La secuencia ha cambiado. Consulta el estado.');
    if (!key || key.length > 100) throw new Error('Clave de idempotencia inválida.');
    if (session.before && session.before.status !== 'completed') { session.status = 'stale'; throw new Error('El grafo base se ha invalidado. Reconstrúyelo antes de continuar.'); }
    if (inputIdentity(this.load()) !== session.inputId) { session.status = 'stale'; throw new Error('Las fuentes base han cambiado. Reconstruye el grafo.'); }
    session.requests.set(key, expected); session.status = 'running'; session.error = undefined;
    setImmediate(() => {
      if (session.status !== 'running') return;
      const start = performance.now(), phase = session.phases[expected]!;
      try {
        if (session.kind === 'impact' && expected === 0) session.pipeline = createDiscoveryPipeline({ ...session.input, sources: applyEdits(session.input.sources, session.edits, session.input.config) });
        else if (session.pipeline.nextPhase) session.pipeline.next();
        else if (phase.id === 'impact') session.local = analyzePrepared(session.before!.pipeline.archive!, session.pipeline.archive!, session.edits);
        else if (phase.id === 'selection') {
          const after = session.pipeline.archive!, local = session.local!, base = session.before!.pipeline.archive!;
          const federated = calculateFederatedImpact(base, after, session.edits);
          session.analysis = { id: hash(`${base.graph.id}:${canonical(session.edits)}`), snapshotId: base.graph.id, beforeGraphId: base.graph.id,
            afterGraphId: after.graph.id, discovery: after.graph, graph: local.graph, diff: local.diff, result: local.result, delta: local.delta, federated };
        }
        const archive = session.pipeline.archive ?? session.pipeline.partial(`partial:${id}:${expected + 1}`);
        const last = session.history.at(-1)?.archive.graph ?? createDiscoveryPipeline(session.input).partial(`partial:${id}:0`).graph;
        const changes = delta(last, archive.graph);
        const baseline = session.before?.history[Math.max(0, session.pipeline.completed - 1)]?.archive.graph;
        const comparison = baseline ? delta(baseline, archive.graph) : changes;
        const finalComparison = phase.id === 'delta' || phase.id === 'impact' || phase.id === 'selection';
        const difference = finalComparison && session.before ? delta(session.before.pipeline.archive!.graph, archive.graph) : comparison;
        const changedProofs = (diff: ReturnType<typeof delta>) => new Set([...diff.evidence.added.map(item => item.id),
          ...diff.evidence.changed.filter(item => canonical(item.before.locator) !== canonical(item.after.locator)).map(item => item.id)]);
        const comparisonProofs = changedProofs(difference), phaseProofs = changedProofs(changes);
        const refreshedEdges = archive.graph.edges.filter(edge => edge.evidenceIds.some(id => comparisonProofs.has(id) && phaseProofs.has(id)));
        const newNodes = session.before ? difference.nodes.added.filter(item => changes.nodes.added.some(change => change.id === item.id)) : changes.nodes.added;
        const newEdges = session.before ? difference.edges.added.filter(item => changes.edges.added.some(change => change.id === item.id)) : changes.edges.added;
        let result = `${archive.graph.nodes.length} nodos y ${archive.graph.edges.length} conexiones comprobados. +${newNodes.length} nodos · +${newEdges.length} conexiones en este paso.`;
        if (phase.id === 'sources') result = `${Object.keys(session.input.sources).length} archivos fijados. El grafo aún no contiene dependencias.`;
        if (phase.id === 'external' && !session.input.inventoryRevision) result = 'Proveedor contract-only: sin fuente externa no descubrimos ni afirmamos ejecución de sus tests.';
        if (phase.id === 'observations') result = session.input.observationDataset || session.input.meshDataset ? `${archive.graph.observations.length} observaciones correlacionadas; captura fijada, no tráfico del overlay.` : 'Sin trazas ni dataset mesh cargados. Se conserva el descubrimiento estático.';
        if (phase.id === 'diff') result = `${session.edits.length} archivos modificados en una copia de trabajo. El base queda pendiente de revalidar.`;
        if (phase.id === 'impact') result = session.local!.result.selectionMode === 'conservative-full' ? `Selección conservadora: ${session.local!.result.selectedTests.length} tests locales. ${session.local!.result.warnings.join(' ')}` : `${session.local!.result.selectedTests.length} tests locales seleccionados por caminos causales.`;
        if (phase.id === 'selection') result = `${session.analysis!.result.selectedTests.length} tests locales y ${session.analysis!.federated.suites.filter(item => item.selected).length} suites distribuidas seleccionados. Todavía sin ejecutar.`;
        const step: GraphStepResult = { ...phase, sequence: expected + 1, durationMs: performance.now() - start, result,
          newNodeIds: newNodes.map(item => item.id), newEdgeIds: newEdges.map(item => item.id),
          updatedNodeIds: [...new Set([...difference.nodes.changed.filter(item => changes.nodes.added.some(change => change.id === item.id) || changes.nodes.changed.some(change => change.id === item.id)).map(item => item.id),
            ...(phase.id === 'observations' ? archive.graph.observations.flatMap(item => item.correlation.nodeIds) : [])])],
          updatedEdgeIds: [...new Set([...difference.edges.changed.filter(item => changes.edges.added.some(change => change.id === item.id) || changes.edges.changed.some(change => change.id === item.id)).map(item => item.id),
            ...refreshedEdges.filter(item => !newEdges.some(edge => edge.id === item.id)).map(item => item.id),
            ...(phase.id === 'observations' ? archive.graph.observations.flatMap(item => item.correlation.edgeIds) : [])])],
          removedNodeIds: session.before ? difference.nodes.removed.map(item => item.id) : [], removedEdgeIds: session.before ? difference.edges.removed.map(item => item.id) : [],
          confirmedNodeIds: baseline?.nodes.map(item => item.id) ?? [], confirmedEdgeIds: baseline?.edges.map(item => item.id) ?? [] };
        if (expected + 1 === session.phases.length) {
          if (session.kind === 'discovery') this.publish(session.pipeline.archive!);
          else this.completed(session.analysis!, session.edits, session.pipeline.archive!);
        }
        session.history.push({ archive: structuredClone(archive), step, ...(session.local ? { localImpact: session.local.result } : {}) });
        session.status = session.history.length === session.phases.length ? 'completed' : 'waiting';
      } catch (error) { session.status = 'error'; session.error = error instanceof Error ? error.message : 'La fase ha fallado.'; }
    });
    return this.view(id);
  }
  cancel(id: string) { const session = this.get(id); session.status = 'cancelled'; session.analysis = undefined; return this.view(id); }
  locate(id: string, sequence: number, selection: { evidenceId: string } | { nodeId: string; index: number }, before = false) {
    const session = this.get(id), archive = before ? session.before?.pipeline.archive : session.history[sequence - 1]?.archive;
    if (!archive) throw new Error('Fuente no disponible en ese paso.');
    return locateSource(archive, selection);
  }
  suite(id: string, suiteId: string) {
    const session = this.get(id), archive = session.pipeline.archive ?? session.before?.pipeline.archive;
    if (!archive) throw new Error('Construye el grafo para consultar las suites fijadas.');
    const suite = readFederatedSuites(archive).find(item => item.id === suiteId);
    if (!suite) throw new Error('Suite no registrada.');
    return { ...suite, source: archive.executionFiles[suite.file] ?? null, snapshotId: archive.graph.id,
      decision: session.analysis?.federated.suites.find(item => item.id === suiteId) };
  }
}
