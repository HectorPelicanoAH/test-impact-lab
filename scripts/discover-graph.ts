import { resolve } from 'node:path';
import { SnapshotStore, WorkspaceSnapshots } from './graph/store';
import { buildArchive, loadWorkspace } from './graph/snapshot';
import { delta } from './graph/core';

const root = resolve(process.cwd());
const store = new SnapshotStore(resolve(root, '.impact-snapshots'));
if (process.argv.includes('--check')) {
  const current = store.read();
  const rebuilt = buildArchive(loadWorkspace(root));
  if (current.graph.id !== rebuilt.graph.id) throw new Error('Stale v2 snapshot; run pnpm graph:discover.');
  console.log(`V2 snapshot verified: ${current.graph.id}`);
} else {
  let previous;
  try { previous = store.read().graph; } catch { /* First snapshot, no predecessor. */ }
  const workspace = new WorkspaceSnapshots(root, store);
  console.log(`V2 ${workspace.current.graph.id}: ${workspace.current.graph.nodes.length} nodes / ${workspace.current.graph.edges.length} edges / ${workspace.current.graph.diagnostics.length} diagnostics.`);
  if (previous) {
    const change = delta(previous, workspace.current.graph);
    console.log(`Delta nodes +${change.nodes.added.length}/-${change.nodes.removed.length}; edges +${change.edges.added.length}/-${change.edges.removed.length}.`);
  }
  if (process.argv.includes('--watch')) {
    const close = workspace.watch(archive => console.log(`Published ${archive.graph.id}`), error => console.error(`Rebuild failed; previous snapshot retained: ${error.message}`));
    process.once('SIGINT', close); process.once('SIGTERM', close);
    console.log('Watching versioned inputs; each change triggers a complete reproducible rebuild.');
  }
}