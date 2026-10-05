import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { TestMetadata } from '@test-impact/impact-engine';
import type { DemoExecution, ExecutionMode, TestExecution } from './src/types';

export interface RunInput {
  id: string;
  analysisId: string;
  snapshotId: string;
  mode: ExecutionMode;
  root: string;
  edits: { path: string; content: string }[];
  tests: TestMetadata[];
  onUpdate: (execution: DemoExecution) => void;
}

interface CommandResult { code: number; output: string; durationMs: number }
const MAX_OUTPUT = 12_000;
const copyEntries = ['apps', 'packages', 'tests', 'scripts', 'impact', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts'];

function snapshot(execution: DemoExecution): DemoExecution {
  return { ...execution, results: execution.results.map(result => ({ ...result })) };
}

function publish(execution: DemoExecution, onUpdate: RunInput['onUpdate']) {
  onUpdate(snapshot(execution));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function command(cwd: string, executable: string, args: string[], env = process.env): Promise<CommandResult> {
  const started = performance.now();
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '';
    const append = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-MAX_OUTPUT); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const terminate = () => {
      if (!child.pid) return;
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Process already exited. */ }
    };
    const timeout = setTimeout(terminate, 180_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      resolveCommand({ code: code ?? 1, output: output.trim(), durationMs: performance.now() - started });
    });
  });
}

function setRunning(execution: DemoExecution, ids: Set<string>) {
  execution.results = execution.results.map(result => ids.has(result.testId) ? { ...result, status: 'running' } : result);
}

function completeGroup(execution: DemoExecution, results: TestExecution[], ids: Set<string>, output: string) {
  const byId = new Map(results.map(result => [result.testId, result]));
  execution.results = execution.results.map(result => {
    if (!ids.has(result.testId)) return result;
    return byId.get(result.testId) ?? { ...result, status: 'failed', output: output || 'The runner did not return a result for this test.' };
  });
}

function parseVitest(path: string, tests: TestMetadata[], output: string): TestExecution[] {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { testResults: { assertionResults: { fullName: string; status: string; duration?: number; failureMessages?: string[] }[] }[] };
  return report.testResults.flatMap(file => file.assertionResults).flatMap(result => {
    const test = tests.find(candidate => candidate.title === result.fullName);
    if (!test) return [];
    return [{
      testId: test.id,
      name: test.name.replace(/^\[[^\]]+\]\s*/, ''),
      kind: test.kind,
      status: result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed',
      durationMs: result.duration,
      output: result.status === 'passed' ? undefined : (result.failureMessages?.join('\n').slice(-MAX_OUTPUT) || output),
    } satisfies TestExecution];
  });
}

function parsePlaywright(path: string, tests: TestMetadata[], output: string): TestExecution[] {
  interface Suite { suites?: Suite[]; specs?: { title: string; tests: { results: { status: string; duration: number; errors?: { message?: string }[] }[] }[] }[] }
  const report = JSON.parse(readFileSync(path, 'utf8')) as Suite;
  const results: TestExecution[] = [];
  function visit(suite: Suite) {
    for (const spec of suite.specs ?? []) {
      const test = tests.find(candidate => candidate.title === spec.title);
      if (!test) continue;
      const attempt = spec.tests.flatMap(item => item.results).at(-1);
      if (!attempt) continue;
      results.push({
        testId: test.id,
        name: test.name.replace(/^\[[^\]]+\]\s*/, ''),
        kind: test.kind,
        status: attempt.status === 'passed' ? 'passed' : attempt.status === 'skipped' ? 'skipped' : 'failed',
        durationMs: attempt.duration,
        output: attempt.status === 'passed' ? undefined : (attempt.errors?.map(error => error.message).filter(Boolean).join('\n').slice(-MAX_OUTPUT) || output),
      });
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  return results;
}

export async function executeTests(input: RunInput): Promise<DemoExecution> {
  const execution: DemoExecution = {
    id: input.id,
    analysisId: input.analysisId,
    snapshotId: input.snapshotId,
    mode: input.mode,
    status: 'queued',
    results: input.tests.map(test => ({ testId: test.id, name: test.name.replace(/^\[[^\]]+\]\s*/, ''), kind: test.kind, status: 'queued' })),
  };
  publish(execution, input.onUpdate);
  const overlay = mkdtempSync(join(tmpdir(), 'test-impact-lab-'));
  const evidence = resolve(input.root, '.impact-runs', input.id);
  mkdirSync(evidence, { recursive: true });
  const preparationStarted = performance.now();
  let executionStarted: number | undefined;
  try {
    for (const entry of copyEntries) cpSync(resolve(input.root, entry), resolve(overlay, entry), { recursive: true, filter: source => !source.includes('/node_modules/') && !source.includes('/dist/') && !source.includes('/dist-server/') });
    for (const edit of input.edits) writeFileSync(resolve(overlay, edit.path), edit.content, 'utf8');
    const install = await command(overlay, 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts']);
    if (install.code !== 0) throw new Error(`Unable to prepare isolated workspace.\n${install.output}`);

    execution.status = 'running';
    execution.startedAt = new Date().toISOString();
    executionStarted = performance.now();
    publish(execution, input.onUpdate);
    for (const runner of ['vitest', 'playwright'] as const) {
      const tests = input.tests.filter(test => test.runner === runner);
      if (!tests.length) continue;
      const ids = new Set(tests.map(test => test.id));
      const files = [...new Set(tests.map(test => test.file))].sort();
      const pattern = `(?:${tests.map(test => escapeRegex(test.title)).join('|')})$`;
      const reportPath = resolve(evidence, `${runner}.json`);
      setRunning(execution, ids);
      publish(execution, input.onUpdate);
      const result = runner === 'vitest'
        ? await command(overlay, 'pnpm', ['exec', 'vitest', 'run', ...files, '--testNamePattern', `^${pattern}`, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`])
        : await command(overlay, process.execPath, ['scripts/e2e.mjs', ...files, '--grep', pattern, '--reporter=list,json'], { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath });
      let parsed: TestExecution[] = [];
      try { parsed = runner === 'vitest' ? parseVitest(reportPath, tests, result.output) : parsePlaywright(reportPath, tests, result.output); }
      catch { /* Missing or malformed reports become explicit failed results below. */ }
      completeGroup(execution, parsed, ids, result.output);
      publish(execution, input.onUpdate);
    }
    execution.status = execution.results.every(result => result.status === 'passed' || result.status === 'skipped') ? 'passed' : 'failed';
  } catch (error) {
    execution.status = 'failed';
    execution.error = error instanceof Error ? error.message : 'Test execution failed.';
    execution.results = execution.results.map(result => result.status === 'passed' || result.status === 'failed' || result.status === 'skipped'
      ? result : { ...result, status: 'failed', output: execution.error });
  } finally {
    execution.completedAt = new Date().toISOString();
    execution.durationMs = performance.now() - (executionStarted ?? preparationStarted);
    writeFileSync(resolve(evidence, 'summary.json'), `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
    rmSync(overlay, { recursive: true, force: true });
    publish(execution, input.onUpdate);
  }
  return execution;
}
