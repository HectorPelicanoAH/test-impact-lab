import { expect, test } from 'vitest';
import config from '../../impact/discovery.json';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { changeStatus, graphForSide, neighborhood, relatedLegacyEdge, sourceArea, visibleGraph } from '../../apps/demo/src/discovery-view';

const before = buildArchive(loadWorkspace(process.cwd()));

test('graph levels group only recorded roots, preserve evidence type and direction', () => {
  const graph = before.graph;
  const source = graph.nodes.find(node => node.kind === 'file' && node.locations[0]?.path.endsWith('LoginPage.tsx'))!;
  expect(sourceArea(source, config.roots)).toBe('apps/frontend/src');
  const testNode = graph.nodes.find(node => node.kind === 'test')!;
  expect(sourceArea(testNode, config.roots)).toBe('Other / tests');
  const { nodes, edges } = visibleGraph(graph, config.roots, 'apps/frontend/src', 'imports', 'static');
  expect(nodes.length).toBeGreaterThan(0);
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.every(edge => edge.type === 'imports' && edge.evidenceIds.some(id => graph.evidence.find(item => item.id === id)?.kind === 'static'))).toBe(true);
  const subjects = visibleGraph(graph, config.roots, 'all', 'exercises', 'reviewed-declaration');
  expect(subjects.edges.length).toBeGreaterThan(0);
  const edge = subjects.edges[0]!;
  expect(neighborhood(graph, edge.from).dependencies.some(item => item.id === edge.id)).toBe(true);
  expect(neighborhood(graph, edge.to).consumers.some(item => item.id === edge.id)).toBe(true);
  expect(relatedLegacyEdge(graph, edge.qualifiers.legacyId as string)?.id).toBe(edge.id);
});

test('revision selector does not mix removed with added evidence and preserves old facts', () => {
  const result = analyzeOverlay(before, [
    { path: 'apps/frontend/src/GuidedScreen.tsx', operation: 'add', content: 'export function GuidedScreen() { return <aside>Guided</aside>; }' },
    { path: 'apps/frontend/src/LoginPage.tsx', operation: 'delete' },
  ]);
  const added = result.delta.nodes.added.find(node => node.locations[0]?.path.endsWith('GuidedScreen.tsx'))!;
  const removed = result.delta.nodes.removed.find(node => node.locations[0]?.path.endsWith('LoginPage.tsx'))!;
  expect(graphForSide(before.graph, result.after.graph, 'before').id).toBe(result.delta.beforeSnapshotId);
  expect(graphForSide(before.graph, result.after.graph, 'after').id).toBe(result.delta.afterSnapshotId);
  expect(changeStatus(added.id, 'nodes', 'after', result.delta)).toBe('added');
  expect(changeStatus(added.id, 'nodes', 'before', result.delta)).toBe('unchanged');
  expect(changeStatus(removed.id, 'nodes', 'before', result.delta)).toBe('removed');
  expect(before.graph.nodes.some(node => node.id === removed.id)).toBe(true);
  expect(result.after.graph.nodes.some(node => node.id === removed.id && node.kind === 'file')).toBe(false);
  expect(result.delta.edges.removed.length).toBeGreaterThan(0);
});
