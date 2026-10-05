import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { SnapshotStore, WorkspaceSnapshots } from '../../scripts/graph/store';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import type { DiscoveryArchive } from '../../packages/impact-engine/src/schema-v2';
import { canonical } from '../../scripts/graph/core';
import { inventory } from '../../scripts/graph/files';
import { materializeOverlay } from '../../apps/demo/execution';

const temporary: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'impact-g2-test-')); temporary.push(path); return path; };
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = directory();
  const input = loadWorkspace(process.cwd());
  for (const [path, text] of Object.entries(input.executionFiles)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('failed rebuild retains the last valid atomic pointer and historical bytes', () => {
  const root = fixture(), store = new SnapshotStore(join(root, '.impact-snapshots'));
  const workspace = new WorkspaceSnapshots(root, store);
  const original = workspace.current;
  writeFileSync(join(root, 'impact/discovery.json'), '{broken');
  expect(() => workspace.refresh()).toThrow();
  expect(workspace.lastError).toBeDefined();
  expect(store.read().graph.id).toBe(original.graph.id);
  expect(store.read(original.graph.id).sources).toEqual(original.sources);
  writeFileSync(join(root, 'impact/discovery.json'), original.configuration['impact/discovery.json']!);
  writeFileSync(join(root, 'apps/frontend/src/Added.tsx'), 'export const Added = () => null;');
  const next = workspace.refresh();
  expect(next.graph.id).not.toBe(original.graph.id);
  expect(store.read(original.graph.id).sources['apps/frontend/src/Added.tsx']).toBeUndefined();
  expect(store.read().sources['apps/frontend/src/Added.tsx']).toBeDefined();
});

test('real filesystem watch converges to a clean full rebuild for add and delete', async () => {
  const root = fixture();
  const workspace = new WorkspaceSnapshots(root);
  let notified: string | undefined, failure: Error | undefined;
  const close = workspace.watch(archive => { notified = archive.graph.id; }, error => { failure = error; });
  try {
    const path = join(root, 'apps/frontend/src/Watched.tsx');
    writeFileSync(path, 'export const Watched = () => null;');
    // The expanded G5 product is rebuilt while the full suite runs concurrent compiler workers.
    await expect.poll(() => notified, { timeout: 15000 }).toBeDefined();
    expect(failure).toBeUndefined();
    expect(notified).toBe(buildArchive(loadWorkspace(root)).graph.id);
    notified = undefined;
    rmSync(path);
    await expect.poll(() => notified, { timeout: 15000 }).toBeDefined();
    expect(notified).toBe(buildArchive(loadWorkspace(root)).graph.id);
  } finally { close(); }
}, 40000);

test('materialized overlay applies additions and deletions without reading changed checkout bytes', () => {
  const root = directory();
  const captured = { 'apps/frontend/src/Keep.ts': 'export const value = 1;', 'apps/frontend/src/Remove.ts': 'export const old = 1;' };
  materializeOverlay(root, captured, [{ path: 'apps/frontend/src/deep/New.tsx', operation: 'add', content: 'export const New = () => null;' }, { path: 'apps/frontend/src/Remove.ts', operation: 'delete' }]);
  expect(readFileSync(join(root, 'apps/frontend/src/deep/New.tsx'), 'utf8')).toContain('New');
  expect(existsSync(join(root, 'apps/frontend/src/Remove.ts'))).toBe(false);
  expect(readFileSync(join(root, 'apps/frontend/src/Keep.ts'), 'utf8')).toBe(captured['apps/frontend/src/Keep.ts']);
  expect(captured['apps/frontend/src/Remove.ts']).toBeDefined();
});

test('inventory rejects symlinks even when they point back inside the root', () => {
  const root = fixture();
  const input = loadWorkspace(root);
  symlinkSync(join(root, 'apps/frontend/src/LoginPage.tsx'), join(root, 'apps/frontend/src/Linked.tsx'));
  expect(() => inventory(root, input.config)).toThrow(/Symlink/);
});

test('archive reads reject tampered sources, execution bytes and unbound projection inputs', () => {
  const root = directory(), archive = buildArchive(loadWorkspace(process.cwd()));
  const store = new SnapshotStore(root);
  store.publish(archive);
  for (const tamper of [
    (value: DiscoveryArchive) => { value.sources['apps/frontend/src/LoginPage.tsx'] += '\n// changed'; },
    (value: DiscoveryArchive) => { value.executionFiles['scripts/build.mjs'] += '\n// changed'; },
    (value: DiscoveryArchive) => { value.config.roots.push('unbound'); },
    (value: DiscoveryArchive) => { value.catalogue.pop(); },
    (value: DiscoveryArchive) => { value.legacyGraph.edges.pop(); },
  ]) {
    const tampered = structuredClone(archive);
    tamper(tampered);
    writeFileSync(join(root, `${archive.graph.id}.json`), canonical(tampered));
    expect(() => store.read()).toThrow(/Stale|hash|manifest/);
  }
});

test('failed publication after archive write leaves the previous current pointer intact', () => {
  class FailingPublication extends SnapshotStore {
    fail = false;
    override publish(archive: DiscoveryArchive, current = true) {
      if (this.fail) { super.publish(archive, false); throw new Error('Injected pointer publication failure.'); }
      super.publish(archive, current);
    }
  }
  const root = fixture(), store = new FailingPublication(join(root, '.impact-snapshots'));
  const workspace = new WorkspaceSnapshots(root, store), before = workspace.current.graph.id;
  store.fail = true;
  writeFileSync(join(root, 'apps/frontend/src/Unpublished.ts'), 'export const value = true;');
  expect(() => workspace.refresh()).toThrow(/publication failure/);
  expect(store.read().graph.id).toBe(before);
  expect(workspace.current.graph.id).toBe(before);
  store.fail = false;
  expect(workspace.refresh().graph.id).toBe(buildArchive(loadWorkspace(root)).graph.id);
});

test('inventory rejects ancestor symlinks and non-UTF8 files rather than rewriting bytes', () => {
  const root = fixture(), input = loadWorkspace(root), outside = directory();
  mkdirSync(join(outside, 'src'));
  writeFileSync(join(outside, 'src/Outside.ts'), 'export const outside = true;');
  symlinkSync(outside, join(root, 'linked'));
  expect(() => inventory(root, { ...input.config, roots: ['linked/src'] })).toThrow(/Symlink/);
  writeFileSync(join(root, 'apps/frontend/src/binary.png'), Buffer.from([0x89, 0xff, 0x00]));
  expect(() => inventory(root, input.config)).toThrow(/UTF-8/);
});