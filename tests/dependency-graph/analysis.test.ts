import { expect, test } from 'vitest';
import { analyzeSourceEdits, calculateImpact, validateGraph } from '../../packages/impact-engine/src/index';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { buildArchive, compatibilityGraph, loadWorkspace } from '../../scripts/graph/snapshot';
import { applySuggestion, suggestions } from '../../apps/demo/src/suggestions';

test.each(suggestions)('reviewed login compatibility: $id', suggestion => {
  const before = buildArchive(loadWorkspace(process.cwd()));
  const edit = { path: suggestion.path, content: applySuggestion(before.sources[suggestion.path]!, suggestion) };
  const old = analyzeSourceEdits({ originalFiles: before.sources, edits: [edit], graph: before.legacyGraph, catalogue: before.catalogue });
  const next = analyzeOverlay(before, [edit]);
  // Narrow results are preserved where source topology/diagnostics permit it; never miss the historical tests.
  expect(next.result.selectedTests).toEqual(expect.arrayContaining(old.result.selectedTests));
  if (suggestion.id === 'domain') expect(next.result.selectedTests).toEqual(old.result.selectedTests);
  expect(next.after.graph.id).not.toBe(before.graph.id);
  expect(next.delta.beforeSnapshotId).toBe(before.graph.id);
});

test('removing an import/render uses previous dependencies and selects conservatively', () => {
  const before = buildArchive(loadWorkspace(process.cwd()));
  const path = 'apps/frontend/src/LoginPage.tsx';
  const next = analyzeOverlay(before, [{ path, content: 'export function LoginPage() { return null; }' }]);
  expect(next.delta.edges.removed.some(edge => edge.type === 'imports')).toBe(true);
  expect(next.graph.edges.some(edge => edge.from === 'LoginPage' && edge.to === 'LoginForm')).toBe(true);
  expect(next.result.selectionMode).toBe('conservative-full');
  expect(next.result.selectedTests).toHaveLength(before.catalogue.length);
});

test('dynamic destinations, unknown new files and deletion fail closed with explicit diffs', () => {
  const before = buildArchive(loadWorkspace(process.cwd()));
  const path = 'apps/frontend/src/Unknown.ts';
  const added = analyzeOverlay(before, [{ path, operation: 'add', content: 'export const load = (name: string) => import(name);' }]);
  expect(added.after.graph.diagnostics.some(item => item.code === 'dynamic-reference')).toBe(true);
  expect(added.diff[0]?.status).toBe('added');
  expect(added.result.selectedTests).toHaveLength(before.catalogue.length);
  const removed = analyzeOverlay(before, [{ path: 'apps/frontend/src/LoginPage.tsx', operation: 'delete' }]);
  expect(removed.diff[0]?.status).toBe('deleted');
  expect(removed.result.selectionMode).toBe('conservative-full');
  const deletedId = removed.after.graph.nodes.find(node => node.legacyId === 'LoginPage')!.id;
  expect(removed.after.graph.edges.some(edge => edge.type === 'exercises' && edge.to === deletedId)).toBe(false);
  const incomplete = compatibilityGraph(removed.after);
  expect(() => validateGraph(incomplete, before.catalogue)).toThrow(/Missing local test relationship/);
  expect(calculateImpact({ graph: incomplete, catalogue: before.catalogue, diff: [], changedEntityIds: [], uncertaintyReasons: ['Deleted reviewed subject'] }).selectedTests).toHaveLength(before.catalogue.length);
  expect(analyzeOverlay(removed.after, []).result.selectionMode).toBe('conservative-full');
});