import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeSnapshot, createIndex, queryGraph, hash } from '../src/core.mjs';
import { importV2 } from '../src/import-v2.mjs';
import { inspectProject } from '../src/inspect.mjs';
import { listenViewer } from '../src/server.mjs';
import { exportRepository } from '../scripts/export.mjs';

const sample = JSON.parse(await readFile(new URL('../examples/system.json', import.meta.url), 'utf8'));

test('normalization is stable across graph order and rejects corrupt content IDs', () => {
  const first = normalizeSnapshot(sample);
  const reverse = { ...sample, nodes: [...sample.nodes].reverse(), edges: [...sample.edges].reverse(), evidence: [...sample.evidence].reverse() };
  assert.equal(first.id, normalizeSnapshot(reverse).id);
  assert.deepEqual(normalizeSnapshot(first), first);
  assert.throws(() => normalizeSnapshot({ ...first, metadata: { title: 'modified' } }), /hash mismatch/);
});

test('dangling links, missing evidence and duplicate IDs cannot enter the viewer model', () => {
  const edge = sample.edges[0];
  assert.throws(() => normalizeSnapshot({ ...sample, edges: [{ ...edge, to: 'absent' }] }), /Dangling/);
  assert.throws(() => normalizeSnapshot({ ...sample, edges: [{ ...edge, evidenceIds: [] }] }), /Missing edge evidence/);
  assert.throws(() => normalizeSnapshot({ ...sample, nodes: [...sample.nodes, sample.nodes[0]] }), /Duplicate/);
});

test('query searches the full index and paginates without mutating the snapshot', () => {
  const index = createIndex(sample);
  const before = index.snapshot.id;
  assert.equal(queryGraph(index, { limit: 1 }).nodes.length, 1);
  const found = queryGraph(index, { q: 'Journey' });
  assert.equal(found.matchedNodes, 1);
  assert.equal(found.nodes[0].id, 'example:e2e');
  const staticOnly = queryGraph(index, { evidence: 'static' });
  assert.ok(staticOnly.edges.every(edge => edge.id !== 'example:binding'));
  assert.equal(index.snapshot.id, before);
  assert.equal(normalizeSnapshot(index.snapshot).id, before);
});

test('v2 import preserves reviewed declarations and rejects tampered included sources', () => {
  const source = 'export const value = 1;\n';
  const archive = {
    graph: {
      schemaVersion: 2, repositories: [{ repositoryId: 'another-project' }],
      nodes: sample.nodes, edges: [sample.edges[0]], diagnostics: [],
      evidence: [{ id: 'example:static', kind: 'reviewed-declaration', locator: { path: 'src/value.js', sourceHash: hash(source) } }]
    },
    sources: { 'src/value.js': source }
  };
  const converted = importV2(archive, { includeSources: true });
  assert.equal(converted.evidence[0].kind, 'declaration');
  assert.equal(converted.evidence[0].originalKind, 'reviewed-declaration');
  assert.equal(Object.keys(importV2(archive).sources).length, 0);
  archive.sources['src/value.js'] = 'tampered';
  assert.throws(() => importV2(archive, { includeSources: true }), /hash mismatch/);
});

test('inspection reads manifests as data and reports candidates without executing scripts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impact-inspect-'));
  try {
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'node_modules', 'hidden.spec.js'), '');
    await writeFile(join(root, 'sample.test.ts'), '');
    await writeFile(join(root, 'test_sample.py'), '');
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'exit 99' }, devDependencies: { vitest: 'example' } }));
    const report = await inspectProject(root);
    assert.deepEqual(report.candidateTestFiles, ['sample.test.ts', 'test_sample.py']);
    assert.deepEqual(report.manifests[0].runners, ['vitest']);
    assert.equal(report.capabilities.perTestCoverage, 'not-implemented');
    assert.equal(report.files.some(path => path.startsWith('node_modules/')), false);
    assert.equal(report.id, (await inspectProject(root)).id);
    assert.ok((await inspectProject(root, { maxFiles: 1 })).diagnostics.some(item => item.code === 'inventory-limit'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('viewer serves only snapshot data and fixed assets, and rejects mutations', async () => {
  const server = await listenViewer(sample);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const overview = await (await fetch(base + '/api/summary')).json();
    assert.equal(overview.counts.nodes, sample.nodes.length);
    assert.equal(overview.coverage.status, 'not-computed');
    const filtered = await (await fetch(base + '/api/graph?q=Journey')).json();
    assert.equal(filtered.matchedNodes, 1);
    const diagnostics = await (await fetch(base + '/api/diagnostics?limit=1')).json();
    assert.equal(diagnostics.total, sample.diagnostics.length);
    assert.equal(diagnostics.items.length, 1);
    const node = await (await fetch(base + '/api/node?id=example:transform')).json();
    assert.equal(node.totalLinks, 2);
    assert.equal((await fetch(base + '/api/evidence?id=absent')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/api/graph', { method: 'POST' })).status, 405);
    assert.match((await fetch(base)).headers.get('content-security-policy'), /script-src 'self'/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('repository export is standalone and refuses to overwrite existing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'impact-export-'));
  const target = join(root, 'standalone');
  try {
    await exportRepository(target);
    const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    assert.equal(manifest.bin.impact, 'bin/impact.mjs');
    assert.match(await readFile(join(target, 'docs', 'SDD.md'), 'utf8'), /SDD/);
    assert.match(await readFile(join(target, 'skills', 'test-impact-onboard', 'SKILL.md'), 'utf8'), /name: test-impact-onboard/);
    const validated = spawnSync(process.execPath, ['bin/impact.mjs', 'validate', 'examples/system.json'], { cwd: target, encoding: 'utf8' });
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(JSON.parse(validated.stdout).valid, true);
    const unavailable = spawnSync(process.execPath, ['bin/impact.mjs', 'check'], { cwd: target, encoding: 'utf8' });
    assert.equal(unavailable.status, 2);
    assert.match(unavailable.stderr, /Command unavailable/);
    await assert.rejects(() => exportRepository(target), /empty/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
