import { resolve } from 'node:path';
import { executeTests } from '../apps/demo/execution';
import type { OverlayEdit } from '../packages/impact-engine/src/schema-v2';
import { buildArchive, loadWorkspace } from './graph/snapshot';
import { analyzeOverlay } from './graph/analyze';
import { fileHashes, hash } from './graph/core';

const root = resolve(process.cwd());
const archive = buildArchive(loadWorkspace(root));
const pagePath = 'apps/frontend/src/LoginPage.tsx', entryPath = 'apps/frontend/src/main.tsx';
const edits: OverlayEdit[] = [
  { path: 'apps/frontend/src/OverlayPage.tsx', operation: 'add', content: 'export function OverlayPage() { return <aside>Overlay page connected</aside>; }\n' },
  { path: pagePath, content: `import { OverlayPage } from './OverlayPage';\n${archive.sources[pagePath]!.replace('<h1>Sign in</h1>', '<h1>Sign in</h1><OverlayPage />')}` },
  { path: 'apps/frontend/src/styles.css', operation: 'delete' },
  { path: entryPath, content: archive.sources[entryPath]!.replace("import './styles.css';", '') },
];
const analysis = analyzeOverlay(archive, edits);
if (analysis.result.selectionMode !== 'conservative-full' || analysis.result.selectedTests.length !== archive.catalogue.length) throw new Error('CRUD topology did not select conservatively.');
if (!analysis.delta.nodes.added.some(node => node.locations[0]?.path === 'apps/frontend/src/OverlayPage.tsx')) throw new Error('Added page absent from delta.');
const before = hash(fileHashes(archive.sources));
const execution = await executeTests({ id: `g2-crud-${Date.now()}`, analysisId: analysis.after.graph.id, snapshotId: archive.graph.id,
  mode: 'selected', root, edits, sourceSnapshot: archive.executionFiles, discoveryConfig: archive.config,
  tests: archive.catalogue, onUpdate() {} });
if (execution.status !== 'passed' || execution.results.length !== archive.catalogue.length || execution.results.some(test => test.status !== 'passed' || test.durationMs === undefined)) throw new Error(`CRUD overlay execution failed: ${JSON.stringify(execution)}`);
if (hash(fileHashes(loadWorkspace(root).sources)) !== before) throw new Error('CRUD verification modified checkout sources.');
console.log(`G2 CRUD overlay: ${execution.results.length} real tests passed, ${execution.durationMs?.toFixed(0)} ms; added/connected page and deleted stylesheet, checkout unchanged.`);