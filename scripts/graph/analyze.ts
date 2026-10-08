import { boundedContractDiagnostic, connectedAddition } from '../../packages/impact-engine/src/change-scope';
import { analyzeSourceEdits, calculateImpact } from '../../packages/impact-engine/src/index';
import type { FileDiff, ImpactGraph } from '../../packages/impact-engine/src/schema';
import type { DiscoveryArchive, GraphSnapshotV2, OverlayEdit } from '../../packages/impact-engine/src/schema-v2';
import { applyEdits } from './files';
import { buildArchive, compatibilityGraph } from './snapshot';
import { canonical, delta, ordered, sourceText } from './core';
import { calculateFederatedImpact } from '../../packages/impact-engine/src/federated';

function semanticEdges(graph: GraphSnapshotV2) {
  // Occurrence/range changes alone do not constitute a topology change.
  return graph.edges.filter(edge => edge.type !== 'contains').map(edge => edge.id).sort();
}
function missingSubjects(graph: ImpactGraph, archive: DiscoveryArchive) {
  return archive.catalogue.filter(test => !graph.edges.some(edge => edge.from === test.nodeId && edge.type === 'exercises' && edge.policy.reverseImpact))
    .map(test => `Reviewed test subject is absent for ${test.id}; full available catalogue required.`);
}
export function analyzeOverlay(before: DiscoveryArchive, edits: OverlayEdit[]) {
  const sources = applyEdits(before.sources, edits, before.config);
  const after = buildArchive({ ...before, sources });
  return { ...analyzePrepared(before, after, edits), federated: calculateFederatedImpact(before, after, edits) };
}

/** Analyze already-discovered snapshots; never runs extraction a second time. */
export function analyzePrepared(before: DiscoveryArchive, after: DiscoveryArchive, edits: OverlayEdit[]) {
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
  const federated = calculateFederatedImpact(before, after, edits);
  const bounded = federated.mode === 'graph';
  const reasons = new Set([...oldMapping.result.warnings, ...newMapping.result.warnings].filter(reason => !bounded || !reason.startsWith('No graph entity covers changed lines')));
  if (!bounded && canonical(semanticEdges(before.graph)) !== canonical(semanticEdges(after.graph))) reasons.add('Dependency topology changed; G2 selects the full available catalogue using both snapshots.');
  if (edits.some(edit => edit.operation === 'delete' || edit.operation === 'add' && !connectedAddition(before, after, edit.path))) reasons.add('Source added or deleted; full available catalogue selected. External unknown tests are not covered.');
  const diagnosisKey = (archive: DiscoveryArchive, item: GraphSnapshotV2['diagnostics'][number]) => canonical([item.code, item.message,
    item.locator && 'path' in item.locator ? item.locator.path : null, sourceText(item.locator, archive.sources)]);
  const oldDiagnostics = new Set(before.graph.diagnostics.map(item => diagnosisKey(before, item)));
  for (const item of after.graph.diagnostics) {
    const newDiagnostic = !oldDiagnostics.has(diagnosisKey(after, item));
    const editedParseFailure = item.code === 'parse-failed' && edits.some(edit => item.locator && 'path' in item.locator && edit.path === item.locator.path);
    if ((newDiagnostic || editedParseFailure) && !boundedContractDiagnostic(before, edits, item)) reasons.add(item.message);
  }
  // Unbounded changes retain the full fallback outside reviewed compatibility scope.
  for (const edit of edits) {
    if (!bounded && !before.legacyGraph.nodes.some(node => node.kind !== 'test' && node.source?.path === edit.path)) reasons.add(`No reviewed compatibility scope for ${edit.path}; full available catalogue required.`);
  }
  const mappedIds = [...oldMapping.result.changedEntities, ...newMapping.result.changedEntities];
  const mappedPaths = new Set([...beforeView.nodes, ...afterView.nodes].filter(node => mappedIds.includes(node.id)).flatMap(node => node.source ? [node.source.path] : []));
  // Import lines may fall outside reviewed declaration ranges. Resolve those
  // changes to the file's verified declarations, then traverse their actual edges.
  const fallbackPaths = new Set(diff.filter(item => item.status === 'modified' && !mappedPaths.has(item.path)).map(item => item.path));
  const changedEntityIds = [...new Set([...mappedIds,
    ...graph.nodes.filter(node => node.kind !== 'test' && node.source && fallbackPaths.has(node.source.path)).map(node => node.id),
    ...graph.nodes.filter(node => edits.some(edit => (edit.operation === 'add' || edit.operation === 'delete') && node.source?.path === edit.path)).map(node => node.id)])].sort();
  // Distributed subjects without a local projection produce no local seeds;
  // the complete diff remains in the analysis and drives federated selection.
  const result = calculateImpact({ diff: bounded && !changedEntityIds.length ? [] : diff, changedEntityIds, graph, catalogue: before.catalogue, uncertaintyReasons: [...reasons].sort() });
  return { after, graph, diff, result, delta: delta(before.graph, after.graph) };
}
