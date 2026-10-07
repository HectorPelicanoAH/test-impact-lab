import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { analyzeOverlay } from '../../scripts/graph/analyze';
import { locateSource } from '../../scripts/graph/locator';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { hash } from '../../scripts/graph/core';
import { WorkspaceSnapshots, SnapshotStore } from '../../scripts/graph/store';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

function materialize() {
  return JSON.parse(execFileSync(process.execPath, ['scripts/inventory/materialize.mjs'], { encoding: 'utf8' })) as { root: string; revision: string };
}

test('materializer never commits files from a nonempty directory or copies through a symlink into the checkout', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'impact-inventory-guard-'));
  try {
    const sentinel = resolve(directory, 'personal-notes.txt');
    writeFileSync(sentinel, 'never stage this file');
    expect(() => execFileSync(process.execPath, ['scripts/inventory/materialize.mjs', directory], { stdio: 'pipe' })).toThrow();
    expect(readFileSync(sentinel, 'utf8')).toBe('never stage this file');
    expect(existsSync(resolve(directory, '.git'))).toBe(false);
    symlinkSync(process.cwd(), resolve(directory, 'checkout'));
    expect(() => execFileSync(process.execPath, ['scripts/inventory/materialize.mjs', resolve(directory, 'checkout/inventory-dont-create')], { stdio: 'pipe' })).toThrow();
    expect(existsSync(resolve(process.cwd(), 'inventory-dont-create'))).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('independent Git root and versioned HTTP evidence navigate to the real provider revision', () => {
  const { root, revision } = materialize();
  try {
    const base = buildArchive(loadWorkspace(process.cwd(), root));
    const external = base.graph.repositories.find(repo => repo.productId === 'inventory')!;
    expect(external.revision).toBe(revision);
    expect(external.availability).toBe('local');
    expect(base.graph.repositories[0]!.revision).toMatch(/^content:/);
    const invoke = base.graph.edges.find(edge => edge.type === 'invokes-endpoint')!;
    const expose = base.graph.edges.find(edge => edge.type === 'exposes' && edge.from === invoke.to)!;
    expect(invoke.qualifiers).toMatchObject({ environment: 'local', service: 'inventory', method: 'GET', template: '/v1/stock/:sku', version: '1' });
    const proof = base.graph.evidence.find(item => expose.evidenceIds.includes(item.id))!;
    expect(proof.repository).toEqual({ productId: 'inventory', repositoryId: 'external-inventory' });
    const source = locateSource(base, { evidenceId: proof.id })!;
    expect(source.revision).toBe(revision);
    expect(source.path).toBe('external/inventory/src/server.ts');
    expect(source.content).toContain('INVENTORY_PATH');
    const provider = base.graph.nodes.find(node => node.id === expose.to)!;
    expect(locateSource(base, { nodeId: provider.id, index: 0 })?.revision).toBe(revision);
    expect(base.graph.nodes.some(node => node.id === invoke.from && node.productId === 'test-impact-lab')).toBe(true);

    const previousSource = readFileSync(resolve(root, 'src/server.ts'), 'utf8');
    writeFileSync(resolve(root, 'src/server.ts'), `${previousSource}\n// Independent inventory source revision.\n`);
    expect(() => loadWorkspace(process.cwd(), root)).toThrow(/uncommitted/);
    execFileSync('git', ['-C', root, 'add', 'src/server.ts']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test Impact Lab', '-c', 'user.email=local@example.invalid', 'commit', '-qm', 'New inventory revision']);
    const next = buildArchive(loadWorkspace(process.cwd(), root));
    expect(next.graph.repositories[1]!.revision).not.toBe(revision);
    expect(next.graph.repositories[0]!.revision).toBe(base.graph.repositories[0]!.revision);
    expect(next.graph.id).not.toBe(base.graph.id);
    expect(locateSource(base, { evidenceId: proof.id })?.content).toBe(previousSource);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('changed client contract removes unsupported HTTP facts into the delta and selects conservatively', () => {
  const { root } = materialize();
  try {
    const before = buildArchive(loadWorkspace(process.cwd(), root));
    const path = 'packages/api-contract/src/inventory-contract.json';
    const changed = before.sources[path]!.replace('"version": 1', '"version": 2');
    const analysis = analyzeOverlay(before, [{ path, content: changed }]);
    expect(analysis.delta.edges.removed.some(edge => edge.type === 'invokes-endpoint')).toBe(true);
    expect(analysis.after.graph.diagnostics.some(item => item.code === 'missing-contract' && item.message.includes('diverges'))).toBe(true);
    expect(analysis.result.selectionMode).toBe('conservative-full');
    expect(analysis.result.selectedTests).toHaveLength(before.catalogue.length);
    expect(analysis.after.graph.repositories[1]?.revision).toBe(before.graph.repositories[1]?.revision);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a client POST call with a GET comment cannot prove a GET endpoint invocation', () => {
  const before = buildArchive(loadWorkspace(process.cwd(), ''));
  const path = 'apps/backend/src/orders/InventoryClient.ts';
  const changed = before.sources[path]!.replace("method: 'GET'", "method: 'POST' /* method: 'GET' */");
  expect(changed).not.toBe(before.sources[path]);
  const result = analyzeOverlay(before, [{ path, content: changed }]);
  expect(result.delta.edges.removed.some(edge => edge.type === 'invokes-endpoint')).toBe(true);
  expect(result.after.graph.diagnostics.some(item => item.code === 'missing-contract' && item.message.includes('client HTTP call'))).toBe(true);
  expect(result.result.selectionMode).toBe('conservative-full');
});

test('contract-only inventory retains qualified contract, no fabricated provider code or passed external tests', () => {
  const archive = buildArchive(loadWorkspace(process.cwd(), ''));
  const external = archive.graph.repositories.find(repo => repo.productId === 'inventory')!;
  expect(external.availability).toBe('contract-only');
  expect(external.revision).toBe(`contract:${hash(archive.sources['packages/api-contract/src/inventory-contract.json'])}`);
  const invoke = archive.graph.edges.find(edge => edge.type === 'invokes-endpoint')!;
  expect(archive.graph.nodes.find(node => node.id === invoke.to)?.locations).toEqual([]);
  expect(locateSource(archive, { nodeId: invoke.to, index: 0 })).toBeUndefined();
  expect(archive.graph.edges.some(edge => edge.type === 'exposes' && edge.from === invoke.to)).toBe(false);
  expect(archive.graph.diagnostics.some(item => item.code === 'source-inaccessible' && item.message.includes('tests are inaccessible'))).toBe(true);
  expect(archive.catalogue).toHaveLength(39); // Available login catalogue; external tests are not federated before G6.
});

test('unrelated endpoint with identical URL but different environment cannot gain an authoritative edge', () => {
  const input = loadWorkspace(process.cwd(), '');
  const replaced = input.configuration['impact/inventory-binding.json']!.replace('"environment": "local"', '"environment": "production"');
  expect(() => buildArchive({ ...input, configuration: { ...input.configuration, 'impact/inventory-binding.json': replaced } })).toThrow(/Unsupported inventory binding/);
});

test('a provider contract change appears as removed cross-repository edges and preserves historical code', () => {
  const { root } = materialize();
  try {
    const before = buildArchive(loadWorkspace(process.cwd(), root));
    const previous = before.graph.edges.find(edge => edge.type === 'exposes' && edge.qualifiers.service === 'inventory')!;
    const proof = before.graph.evidence.find(item => previous.evidenceIds.includes(item.id))!;
    const path = resolve(root, 'contract/inventory-stock-v1.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"version": 1', '"version": 2'));
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test Impact Lab', '-c', 'user.email=local@example.invalid', 'commit', '-qm', 'Change provider contract']);
    const after = buildArchive(loadWorkspace(process.cwd(), root));
    expect(after.graph.edges.some(edge => edge.id === previous.id)).toBe(false);
    expect(after.graph.diagnostics.some(item => item.code === 'missing-contract' && item.message.includes('diverges'))).toBe(true);
    expect(locateSource(before, { evidenceId: proof.id })?.revision).toBe(before.graph.repositories[1]!.revision);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a changed provider method or route removes the asserted GET exposure even when its declared contract stays v1', () => {
  const mutations = [
    (text: string) => text.replace("request.method !== 'GET' || !match", "request.method !== 'POST' || !match"),
    (text: string) => text.replace(String.raw`/^\/v1\/stock\/`, String.raw`/^\/v2\/stock\/`),
  ];
  for (const mutate of mutations) {
    const { root } = materialize();
    try {
      const before = buildArchive(loadWorkspace(process.cwd(), root));
      expect(before.graph.edges.some(edge => edge.type === 'exposes' && edge.qualifiers.service === 'inventory')).toBe(true);
      const path = resolve(root, 'src/server.ts');
      const original = readFileSync(path, 'utf8');
      const changed = mutate(original);
      expect(changed).not.toBe(original);
      writeFileSync(path, changed);
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, '-c', 'user.name=Test Impact Lab', '-c', 'user.email=local@example.invalid', 'commit', '-qm', 'Change provider route']);
      const after = buildArchive(loadWorkspace(process.cwd(), root));
      expect(after.graph.edges.some(edge => edge.type === 'exposes' && edge.qualifiers.service === 'inventory')).toBe(false);
      expect(after.graph.diagnostics.some(item => item.code === 'missing-contract' && item.message.includes('Provider source'))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
}, 30_000);

test('empty external Git commit changes the pinned snapshot even when source bytes are identical', () => {
  const { root } = materialize();
  const storage = mkdtempSync(resolve(tmpdir(), 'impact-external-store-'));
  try {
    const workspace = new WorkspaceSnapshots(process.cwd(), new SnapshotStore(storage), () => loadWorkspace(process.cwd(), root));
    const first = workspace.current.graph;
    execFileSync('git', ['-C', root, '-c', 'user.name=Test Impact Lab', '-c', 'user.email=local@example.invalid', 'commit', '--allow-empty', '-qm', 'New pinned revision']);
    const second = workspace.refresh().graph;
    expect(second.id).not.toBe(first.id);
    expect(second.repositories[1]?.revision).not.toBe(first.repositories[1]?.revision);
    expect(second.repositories[0]?.revision).toBe(first.repositories[0]?.revision);
    expect(workspace.store.read(first.id).graph.id).toBe(first.id);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(storage, { recursive: true, force: true }); }
});
