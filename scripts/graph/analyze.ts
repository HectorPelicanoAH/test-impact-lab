import { analyzeSourceEdits, calculateImpact } from '../../packages/impact-engine/src/index';
import type { FileDiff, ImpactGraph } from '../../packages/impact-engine/src/schema';
import type { DiscoveryArchive, GraphSnapshotV2, OverlayEdit } from '../../packages/impact-engine/src/schema-v2';
import { applyEdits } from './files';
import { buildArchive, compatibilityGraph } from './snapshot';
import { canonical, delta, ordered, sourceText } from './core';
import { calculateFederatedImpact } from '../../packages/impact-engine/src/federated';
import { progressStep, type ProgressObserver } from './progress';

function semanticEdges(graph: GraphSnapshotV2) {
  // Occurrence/range changes alone do not constitute a topology change.
  return graph.edges.filter(edge => edge.type !== 'contains').map(edge => edge.id).sort();
}
function missingSubjects(graph: ImpactGraph, archive: DiscoveryArchive) {
  return archive.catalogue.filter(test => !graph.edges.some(edge => edge.from === test.nodeId && edge.type === 'exercises' && edge.policy.reverseImpact))
    .map(test => `Reviewed test subject is absent for ${test.id}; full available catalogue required.`);
}
export function analyzeOverlay(before: DiscoveryArchive, edits: OverlayEdit[], observe?: ProgressObserver) {
  const sources = progressStep(observe, { phase: 'diff', title: 'Comparar el código', message: `Comparo ${edits.length} archivos con las fuentes base fijadas. El journey envía código, no una lista de tests.`, technique: 'Comparación de bytes y operaciones de alta, modificación o baja.', side: 'before', snapshotId: before.graph.id,
    nodeIds: before.graph.nodes.map(node => node.id), edgeIds: before.graph.edges.map(edge => edge.id), paths: edits.map(edit => edit.path) }, () => applyEdits(before.sources, edits, before.config));
  const after = buildArchive({ ...before, sources }, observe);
  const changes = progressStep(observe, { phase: 'delta', title: 'Actualizar las relaciones', message: 'Comparo los dos grafos y conservo las relaciones retiradas en su versión anterior.', technique: 'Delta de snapshots anteriores y posteriores.', snapshotId: after.graph.id,
    nodeIds: after.graph.nodes.map(node => node.id), edgeIds: after.graph.edges.map(edge => edge.id) }, () => delta(before.graph, after.graph), value => ({ counts: { added: value.edges.added.length, removed: value.edges.removed.length },
    message: `${value.edges.added.length} relaciones añadidas y ${value.edges.removed.length} retiradas. Las evidencias anteriores siguen disponibles.` }));
  const beforeView = compatibilityGraph(before), afterView = compatibilityGraph(after);
  const graph: ImpactGraph = { schemaVersion: 1,
    nodes: ordered(new Map([...beforeView.nodes, ...afterView.nodes].map(node => [node.id, node])).values()),
    edges: ordered(new Map([...beforeView.edges, ...afterView.edges].map(edge => [edge.id, edge])).values()) };
  const replacements = edits.filter((edit): edit is Exclude<OverlayEdit, { operation: 'delete' }> => edit.operation !== 'delete' && before.sources[edit.path] !== undefined);
  const oldMapping = analyzeSourceEdits({ originalFiles: before.sources, edits: replacements, graph: beforeView, catalogue: before.catalogue, uncertaintyReasons: missingSubjects(beforeView, before) });
  // Map new ranges as well. Reverse replacements intentionally map additions against post-change lines.
  const newMapping = analyzeSourceEdits({ originalFiles: after.sources, edits: replacements.map(edit => ({ path: edit.path, content: before.sources[edit.path]! })), graph: afterView, catalogue: before.catalogue, uncertaintyReasons: missingSubjects(afterView, after) });
  const diff: FileDiff[] = [...oldMapping.diff];
  for (const edit of edits) {
    if (edit.operation === 'add') diff.push({ path: edit.path, status: 'added', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: edit.content.split('\n').length }] });
    if (edit.operation === 'delete') diff.push({ path: edit.path, status: 'deleted', hunks: [{ oldStart: 1, oldLines: before.sources[edit.path]!.split('\n').length, newStart: 0, newLines: 0 }] });
  }
  diff.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const reasons = new Set([...oldMapping.result.warnings, ...newMapping.result.warnings]);
  if (canonical(semanticEdges(before.graph)) !== canonical(semanticEdges(after.graph))) reasons.add('Dependency topology changed; G2 selects the full available catalogue using both snapshots.');
  if (edits.some(edit => edit.operation === 'add' || edit.operation === 'delete')) reasons.add('Source added or deleted; full available catalogue selected. External unknown tests are not covered.');
  const diagnosisKey = (archive: DiscoveryArchive, item: GraphSnapshotV2['diagnostics'][number]) => canonical([item.code, item.message,
    item.locator && 'path' in item.locator ? item.locator.path : null, sourceText(item.locator, archive.sources)]);
  const oldDiagnostics = new Set(before.graph.diagnostics.map(item => diagnosisKey(before, item)));
  for (const item of after.graph.diagnostics) {
    if (!oldDiagnostics.has(diagnosisKey(after, item)) || (item.code === 'parse-failed' && edits.some(edit => item.locator && 'path' in item.locator && edit.path === item.locator.path))) reasons.add(item.message);
  }
  // Existing uncertainty can only stay within the reviewed login compatibility envelope.
  for (const edit of edits) {
    if (!before.legacyGraph.nodes.some(node => node.kind !== 'test' && node.source?.path === edit.path)) reasons.add(`No reviewed compatibility scope for ${edit.path}; full available catalogue required.`);
  }
  const changedEntityIds = [...new Set([...oldMapping.result.changedEntities, ...newMapping.result.changedEntities,
    ...graph.nodes.filter(node => edits.some(edit => (edit.operation === 'add' || edit.operation === 'delete') && node.source?.path === edit.path)).map(node => node.id)])].sort();
  const result = progressStep(observe, { phase: 'policies', title: 'Recorrer el impacto', message: 'Propago el cambio con las políticas de dependencias y los límites de contratos.', technique: 'Recorrido determinista del grafo de compatibilidad.', snapshotId: after.graph.id,
    nodeIds: after.graph.nodes.map(node => node.id), edgeIds: after.graph.edges.map(edge => edge.id) }, () => calculateImpact({ diff, changedEntityIds, graph, catalogue: before.catalogue, uncertaintyReasons: [...reasons].sort() }));
  const widening: string[] = [];
  if (result.warnings.some(reason => reason.startsWith('Source added or deleted;'))) widening.push('hay archivos añadidos o eliminados');
  if (result.warnings.some(reason => reason.startsWith('Dependency topology changed;'))) widening.push('ha cambiado la topología de dependencias');
  if (result.warnings.some(reason => reason.startsWith('No reviewed compatibility scope for '))) widening.push('el cambio está fuera del ámbito revisado del login');
  progressStep(observe, { phase: 'uncertainty', title: 'Explicar la incertidumbre', message: result.selectionMode === 'conservative-full' ? `Amplío la selección local: ${widening.length ? widening.join('; ') : 'los diagnósticos impiden justificar un subconjunto seguro'}. Los motivos completos siguen disponibles.` : 'El cambio queda dentro del ámbito revisado y permite seleccionar por caminos causales.', technique: 'Reglas conservadoras y diagnósticos explícitos.', snapshotId: after.graph.id,
    warnings: result.warnings, nodeIds: after.graph.nodes.map(node => node.id), edgeIds: after.graph.edges.map(edge => edge.id) }, () => undefined);
  const federated = progressStep(observe, { phase: 'selection', title: 'Presentar la selección', message: 'Distingo tests locales y suites distribuidas. Los tests todavía no se han ejecutado.', technique: 'Políticas federadas, catálogo revisado y disponibilidad del runner.', snapshotId: after.graph.id,
    nodeIds: after.graph.nodes.map(node => node.id), edgeIds: after.graph.edges.map(edge => edge.id) }, () => calculateFederatedImpact(before, after, edits), value => ({ counts: { selected: result.selectedTests.length, local: before.catalogue.length, suites: value.suites.filter(suite => suite.selected).length },
    message: `${result.selectedTests.length} de ${before.catalogue.length} tests locales y ${value.suites.filter(suite => suite.selected).length} suites distribuidas seleccionados. Sin ejecutar todavía.` }));
  return { after, graph, diff, result, delta: changes, federated };
}
