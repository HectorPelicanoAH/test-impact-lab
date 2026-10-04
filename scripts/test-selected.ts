import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { calculateImpact } from '../packages/impact-engine/src/index';
import type { ImpactGraph, TestMetadata } from '../packages/impact-engine/src/schema';

const changedEntityIds = process.argv.slice(2);
if (!changedEntityIds.length) throw new Error('Usage: pnpm test:selected LoginButton [User ...]');
const graph = JSON.parse(readFileSync('impact/graph.json', 'utf8')) as ImpactGraph;
const catalogue = JSON.parse(readFileSync('impact/catalogue.json', 'utf8')) as TestMetadata[];
const selection = calculateImpact({ graph, catalogue, changedEntityIds, diff: [], uncertaintyReasons: [] });
const selected = catalogue.filter(test => selection.selectedTests.includes(test.id));
mkdirSync('.impact-runs', { recursive: true });
const directory = resolve(mkdtempSync('.impact-runs/selected-'));
writeFileSync(`${directory}/selection.json`, JSON.stringify(selection, null, 2) + '\n');
console.log(`Executing ${selected.length}/${catalogue.length} product tests on the current checkout (no source overlay).`);
for (const warning of selection.warnings) console.warn(warning);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const results: { testId: string; status: string; durationMs: number }[] = [];
let failed = false;
async function run(args: string[], env = process.env): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { env, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
    const terminate = () => {
      if (!child.pid) return;
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    };
    const timeout = setTimeout(terminate, 120_000);
    process.once('SIGINT', terminate);
    process.once('SIGTERM', terminate);
    const cleanup = () => { clearTimeout(timeout); process.off('SIGINT', terminate); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', code => { cleanup(); resolve(code ?? 1); });
  });
}
function record(test: TestMetadata, status: string, durationMs?: number) {
  if (results.some(result => result.testId === test.id)) throw new Error(`Duplicate result: ${test.id}`);
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) throw new Error(`Missing measured duration: ${test.id}`);
  results.push({ testId: test.id, status, durationMs });
  if (status !== 'passed') failed = true;
}
const start = performance.now();
for (const runner of ['vitest', 'playwright'] as const) {
  const group = selected.filter(test => test.runner === runner);
  if (!group.length) continue;
  const files = [...new Set(group.map(test => test.file))].sort();
  const pattern = `(?:${group.map(test => escapeRegex(test.title)).join('|')})$`;
  const reportPath = `${directory}/${runner}.json`;
  if (runner === 'vitest') {
    const code = await run(['exec', 'vitest', 'run', ...files, '--testNamePattern', `^${pattern}`, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`]);
    failed ||= code !== 0;
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { testResults: { assertionResults: { fullName: string; status: string; duration?: number }[] }[] };
    for (const result of report.testResults.flatMap(file => file.assertionResults)) {
      const test = group.find(test => test.title === result.fullName);
      if (test) record(test, result.status, result.duration);
      else if (!['skipped', 'pending', 'todo'].includes(result.status)) throw new Error(`Unexpected executed test: ${result.fullName}`);
    }
  } else {
    const code = await run(['test:e2e', ...files, '--grep', pattern, '--reporter=list,json'], { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath });
    failed ||= code !== 0;
    interface Suite { suites?: Suite[]; specs?: { title: string; tests: { results: { status: string; duration: number }[] }[] }[] }
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Suite;
    function visit(suite: Suite) {
      for (const spec of suite.specs ?? []) {
        const test = group.find(test => test.title === spec.title);
        if (!test) throw new Error(`Unexpected executed test: ${spec.title}`);
        for (const result of spec.tests.flatMap(test => test.results)) record(test, result.status, result.duration);
      }
      for (const child of suite.suites ?? []) visit(child);
    }
    visit(report);
  }
}
for (const test of selected) if (!results.some(result => result.testId === test.id)) throw new Error(`Selected test did not execute: ${test.id}`);
results.sort((a, b) => a.testId < b.testId ? -1 : a.testId > b.testId ? 1 : 0);
const summary = { source: 'current-checkout', selectedTests: selection.selectedTests, results, wallTimeMs: performance.now() - start };
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.table(results);
console.log(`Measured wall time: ${summary.wallTimeMs.toFixed(0)} ms. Reports: ${directory}`);
process.exitCode = failed ? 1 : 0;
