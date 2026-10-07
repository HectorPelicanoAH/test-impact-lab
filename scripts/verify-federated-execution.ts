import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { materializeInventory } from './inventory/materialize.mjs';
import { buildArchive, loadWorkspace } from './graph/snapshot';
import { analyzeOverlay } from './graph/analyze';
import { readFederatedSuites } from '../packages/impact-engine/src/federated';
import { executeTests } from '../apps/demo/execution';

const external = materializeInventory();
try {
  const before = buildArchive(loadWorkspace(process.cwd(), external.root));
  const path = 'apps/notifications/src/main.ts';
  const original = before.sources[path]!;
  const content = original.replace("status: 'stored'", "status: 'changed'");
  if (content === original) throw new Error('Notification mutation did not apply.');
  const edits = [{ path, content }];
  const analysis = analyzeOverlay(before, edits);
  const catalogue = readFederatedSuites(before);
  const selectedIds = new Set(analysis.federated.suites.filter(item => item.selected).map(item => item.id));
  if (!selectedIds.has('notifications-consumer') || selectedIds.has('preparation-consumer')) throw new Error('Incorrect consumer selection.');
  async function run(mode: 'selected' | 'full') {
    return executeTests({ id: `g6-${mode}-${randomUUID()}`, analysisId: 'verified-mutation', snapshotId: before.graph.id,
      mode, root: process.cwd(), edits, sourceSnapshot: before.executionFiles, discoveryConfig: before.config,
      tests: mode === 'selected' ? before.catalogue.filter(test => analysis.result.selectedTests.includes(test.id)) : before.catalogue,
      federatedSuites: mode === 'selected' ? catalogue.filter(item => selectedIds.has(item.id)) : catalogue,
      onUpdate: () => {} });
  }
  const selected = await run('selected');
  const full = await run('full');
  const failures = (run: typeof selected) => new Set([
    ...run.results.filter(item => item.status === 'failed').map(item => item.testId),
    ...(run.suiteResults ?? []).filter(item => item.status === 'failed').map(item => item.id),
  ]);
  const selectedFailures = failures(selected), fullFailures = failures(full);
  if (!selectedFailures.has('notifications-consumer') || !fullFailures.has('notifications-consumer')) throw new Error('The mutation was not detected in both modes.');
  for (const id of fullFailures) if (!selectedFailures.has(id)) throw new Error(`Full run found a failure missing from selected: ${id}`);
  console.log(JSON.stringify({ selected: { status: selected.status, suites: selected.suiteResults, failures: [...selectedFailures] },
    full: { status: full.status, suites: full.suiteResults, failures: [...fullFailures] } }, null, 2));
} finally { rmSync(external.root, { recursive: true, force: true }); }
