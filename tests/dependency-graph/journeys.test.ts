import { expect, test } from 'vitest';
import { journeys, journeyEdits } from '../../apps/demo/src/journeys';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { locateSource } from '../../scripts/graph/locator';

const before = buildArchive(loadWorkspace(process.cwd()));
test.each(journeys)('$title produces analyzed bytes and inspectable facts in both revisions', ({ id }) => {
  const edits = journeyEdits(id, before.sources);
  const analysis = analyzeOverlay(before, edits);
  expect(analysis.after.graph.id).not.toBe(before.graph.id);
  for (const edit of edits) if (edit.operation !== 'delete') expect(analysis.after.executionFiles[edit.path]).toBe(edit.content);
  for (const archive of [before, analysis.after]) for (const edge of archive.graph.edges) {
    expect(edge.evidenceIds.length).toBeGreaterThan(0);
    for (const evidenceId of edge.evidenceIds) expect(locateSource(archive, { evidenceId }), evidenceId).toBeDefined();
  }
  if (id === 'screen') expect(analysis.delta.edges.added.some(edge => edge.type === 'renders')).toBe(true);
  if (id === 'consumer') {
    const consumer = analysis.after.graph.nodes.find(node => node.kind === 'consumer' && node.label === 'audit');
    expect(consumer).toBeDefined();
    const processes = analysis.after.graph.edges.filter(edge => edge.from === consumer!.id && edge.type === 'processes');
    expect(processes).toHaveLength(1);
    expect(analysis.after.graph.nodes.find(node => node.id === processes[0]!.to)?.label).toBe('audit.order-created.v1');
    expect(analysis.after.graph.edges.some(edge => edge.type === 'processes' && edge.from === consumer!.id
      && analysis.after.graph.nodes.find(node => node.id === edge.to)?.label === 'notifications.order-created.v1')).toBe(false);
  }
  if (['http', 'event', 'unresolved'].includes(id)) {
    expect(analysis.after.graph.diagnostics.some(item => item.code === 'missing-contract')).toBe(true);
    expect(analysis.federated.mode).toBe(id === 'event' ? 'graph' : 'conservative-full');
    expect(analysis.delta.edges.removed.some(edge => edge.type === (id === 'event' ? 'publishes' : 'invokes-endpoint'))).toBe(true);
  }
  if (id === 'retry') expect(analysis.federated.suites.find(suite => suite.id === 'notifications-consumer')?.selected).toBe(true);
});

test('journeys refuse stale source and existing added files instead of silently fabricating a change', () => {
  expect(() => journeyEdits('screen', { ...before.sources, 'apps/frontend/src/GuidedScreen.tsx': '' })).toThrow(/overwrite/);
  expect(() => journeyEdits('retry', { ...before.sources, 'apps/notifications/src/main.ts': 'export function notify() {}' })).toThrow(/changed/);
});


test('connected screen addition selects only its existing login journey, not backend or distributed suites', () => {
  const analysis = analyzeOverlay(before, journeyEdits('screen', before.sources));
  expect(analysis.result.selectionMode).toBe('graph');
  expect(analysis.result.selectedTests).toEqual(['E1']);
  expect(analysis.result.explanations[0]?.path.length).toBeGreaterThan(0);
  expect(analysis.federated.mode).toBe('graph');
  expect(analysis.federated.suites.filter(suite => suite.selected)).toEqual([]);
});

test('incompatible event retains old dependencies but selects only its contract and consumers', () => {
  const analysis = analyzeOverlay(before, journeyEdits('event', before.sources));
  expect(analysis.result.selectionMode).toBe('graph');
  expect(analysis.result.selectedTests).toEqual([]);
  expect(analysis.federated.mode).toBe('graph');
  expect(analysis.federated.suites.filter(suite => suite.selected).map(suite => suite.id)).toEqual([
    'messaging-browser', 'messaging-runtime', 'notifications-consumer', 'order-created-contract', 'preparation-consumer',
  ]);
  expect(analysis.delta.edges.removed.some(edge => edge.type === 'publishes')).toBe(true);
});

test('a connected screen cannot mask an unresolved change elsewhere', () => {
  const analysis = analyzeOverlay(before, [...journeyEdits('screen', before.sources), ...journeyEdits('unresolved', before.sources)]);
  expect(analysis.result.selectionMode).toBe('conservative-full');
  expect(analysis.result.selectedTests).toHaveLength(before.catalogue.length);
  expect(analysis.federated.mode).toBe('conservative-full');
});
