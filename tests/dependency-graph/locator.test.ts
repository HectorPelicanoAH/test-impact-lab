import { expect, test } from 'vitest';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { locateSource } from '../../scripts/graph/locator';
import { offset, sourceText } from '../../scripts/graph/core';

const archive = buildArchive(loadWorkspace(process.cwd()));

test('static import points to the exact source occurrence and archived revision', () => {
  const edge = archive.graph.edges.find(item => item.type === 'imports' && !item.qualifiers.legacyId && item.qualifiers.specifier === './LoginPage')!;
  const proof = archive.graph.evidence.find(item => item.id === edge.evidenceIds[0])!;
  const located = locateSource(archive, { evidenceId: proof.id })!;
  expect(located.snapshotId).toBe(archive.graph.id);
  expect(located.revision).toBe(archive.graph.repositories[0]?.revision);
  expect(located.kind).toBe('source');
  expect(sourceText({ kind: 'source', path: located.path, sourceHash: located.sourceHash, start: located.start, end: located.end }, archive.sources)).toBe("'./LoginPage'");
});

test('reviewed declaration resolves JSON pointer to its exact configuration value, never its related source', () => {
  const proof = archive.graph.evidence.find(item => item.kind === 'reviewed-declaration' && item.locator.kind === 'declaration' && item.locator.pointer.startsWith('/tests/'))!;
  const located = locateSource(archive, { evidenceId: proof.id })!;
  expect(located.kind).toBe('declaration');
  expect(located.path).toBe('impact/evidence/architecture.json');
  expect(located.pointer).toBe(proof.locator.kind === 'declaration' ? proof.locator.pointer : undefined);
  expect(JSON.parse(located.content.slice(offset(located.content, located.start), offset(located.content, located.end)))).toBe('LoginForm');
  expect(located.path).not.toBe(located.relatedSource);
});

test('missing node range and unknown proof cannot produce a navigable link', () => {
  const unknown = { ...archive, graph: { ...archive.graph, nodes: [...archive.graph.nodes, { ...archive.graph.nodes[0]!, id: 'no-source', locations: [] }] } };
  expect(locateSource(unknown, { nodeId: 'no-source', index: 0 })).toBeUndefined();
  expect(locateSource(archive, { evidenceId: 'unknown' })).toBeUndefined();
  expect(locateSource(archive, { nodeId: archive.graph.nodes[0]!.id, index: -1 })).toBeUndefined();
});

test('tampered or absent archived bytes and unverified JSON pointers never fall back to the checkout', () => {
  const proof = archive.graph.evidence.find(item => item.kind === 'reviewed-declaration' && item.locator.kind === 'declaration')!;
  const withoutConfig = { ...archive, configuration: { ...archive.configuration } };
  delete withoutConfig.configuration['impact/evidence/architecture.json'];
  expect(locateSource(withoutConfig, { evidenceId: proof.id })).toBeUndefined();
  const tampered = { ...archive, configuration: { ...archive.configuration, 'impact/evidence/architecture.json': '{}' } };
  expect(locateSource(tampered, { evidenceId: proof.id })).toBeUndefined();
  if (proof.locator.kind !== 'declaration') throw new Error('Expected a reviewed declaration.');
  const invalid = { ...archive, graph: { ...archive.graph, evidence: archive.graph.evidence.map(item => item.id === proof.id ?
    { ...item, locator: { ...proof.locator, pointer: '/not-a-proven-value' } } : item) } };
  expect(locateSource(invalid, { evidenceId: proof.id })).toBeUndefined();
});