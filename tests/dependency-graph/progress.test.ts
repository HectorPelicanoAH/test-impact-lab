import { expect, test } from 'vitest';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { journeyEdits } from '../../apps/demo/src/journeys';
import { guidedFacts } from '../../apps/demo/src/guided-view';
import type { ProgressEvent } from '../../scripts/graph/progress';

const input = loadWorkspace(process.cwd());
const before = buildArchive(input);

test('recording discovery preserves identity and only exposes facts produced by each phase', () => {
  const events: ProgressEvent[] = [];
  const recorded = buildArchive(input, event => { if (event.status === 'completed') events.push(event); });
  expect(recorded).toEqual(before);
  expect(events.map(event => event.phase)).toEqual(['inventory', 'typescript', 'reviewed', 'external', 'http', 'messaging', 'observations', 'validation']);
  expect(events[0]!.edgeIds).toEqual([]);
  const compiler = events.find(event => event.phase === 'typescript')!;
  expect(compiler.edgeIds.every(id => !before.graph.edges.find(edge => edge.id === id)?.qualifiers.legacyId)).toBe(true);
  expect(compiler.edgeIds.every(id => !['subscribes', 'processes'].includes(before.graph.edges.find(edge => edge.id === id)!.type))).toBe(true);
  const seenProofs = new Set<string>();
  for (const event of events) {
    for (const id of event.evidenceIds) {
      expect(seenProofs.has(id)).toBe(false);
      expect(recorded.graph.evidence.some(proof => proof.id === id)).toBe(true);
      seenProofs.add(id);
    }
    expect(event.edgeIds.every(id => recorded.graph.edges.some(edge => edge.id === id))).toBe(true);
  }
  expect(events.at(-1)?.edgeIds).toEqual(recorded.graph.edges.map(edge => edge.id));
});

test.each(['consumer', 'http'] as const)('recording %s impact preserves selection and the conservative reasons', journey => {
  const edits = journeyEdits(journey, before.sources), events: ProgressEvent[] = [];
  const plain = analyzeOverlay(before, edits);
  const recorded = analyzeOverlay(before, edits, event => { if (event.status === 'completed') events.push(event); });
  expect(recorded).toEqual(plain);
  expect(events[0]?.side).toBe('before');
  expect(events.at(-1)?.phase).toBe('selection');
  expect(events.find(event => event.phase === 'uncertainty')?.warnings).toEqual(recorded.result.warnings);
  expect(events.at(-1)?.counts.selected).toBe(recorded.result.selectedTests.length);
  const messaging = events.find(event => event.phase === 'messaging')!;
  const facts = guidedFacts(recorded.after.graph, messaging, journey);
  expect(facts.edges.every(edge => messaging.edgeIds.includes(edge.id))).toBe(true);
  if (journey === 'consumer') {
    const compiler = guidedFacts(recorded.after.graph, events.find(event => event.phase === 'typescript'), journey);
    expect(compiler.nodes.some(node => node.kind === 'symbol' && node.label === 'audit')).toBe(true);
    expect(compiler.nodes.some(node => node.kind === 'consumer')).toBe(false);
    expect(events.find(event => event.phase === 'uncertainty')?.message).toContain('ha cambiado la topología');
    expect(facts.nodes.some(node => node.kind === 'consumer' && node.label === 'audit')).toBe(true);
    expect(facts.nodes.some(node => node.kind === 'consumer' && node.label === 'preparation')).toBe(false);
  }
});
