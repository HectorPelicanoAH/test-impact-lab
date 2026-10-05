import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
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
const environmentKeys = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'ComSpec', 'PATHEXT', 'LOCALAPPDATA', 'APPDATA', 'PNPM_HOME', 'COREPACK_HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'LC_ALL', 'TZ', 'CI'] as const;

export function runnerEnvironment(source: NodeJS.ProcessEnv = process.env, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of environmentKeys) if (source[key] !== undefined) environment[key] = source[key];
  return { ...environment, ...extra };
}

function snapshot(execution: DemoExecution): DemoExecution {
  return { ...execution, results: execution.results.map(result => ({ ...result })) };
}

function publish(execution: DemoExecution, onUpdate: RunInput['onUpdate']) {
  onUpdate(snapshot(execution));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function command(cwd: string, executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const started = performance.now();
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '';
    const append = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-MAX_OUTPUT); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch { /* Process already exited. */ }
    };
    let forceTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      terminate('SIGTERM');
      forceTimer = setTimeout(() => terminate('SIGKILL'), 2_000);
    }, 180_000);
    child.once('error', error => { clearTimeout(timeout); if (forceTimer) clearTimeout(forceTimer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      resolveCommand({ code: code ?? 1, output: output.trim(), durationMs: performance.now() - started });
    });
  });
}

function setRunning(execution: DemoExecution, ids: Set<string>) {
  execution.results = execution.results.map(result => ids.has(result.testId) ? { ...result, status: 'running' } : result);
}

function completeGroup(execution: DemoExecution, results: TestExecution[], ids: Set<string>, output: string) {
  const seen = new Set<string>();
  for (const result of results) {
    if (!ids.has(result.testId)) throw new Error(`Runner returned an unrequested test: ${result.testId}.`);
    if (seen.has(result.testId)) throw new Error(`Runner returned a duplicate test: ${result.testId}.`);
    seen.add(result.testId);
  }
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
    if (!test) {
      if (result.status === 'skipped' || result.status === 'pending') return [];
      throw new Error(`Vitest executed an unrequested test: ${result.fullName}.`);
    }
    if (result.status !== 'skipped' && (typeof result.duration !== 'number' || !Number.isFinite(result.duration) || result.duration < 0)) {
      throw new Error(`Vitest omitted a measured duration for ${test.id}.`);
    }
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
      const attempt = spec.tests.flatMap(item => item.results).at(-1);
      if (!attempt) continue;
      if (!test) {
        if (attempt.status === 'skipped') continue;
        throw new Error(`Playwright executed an unrequested test: ${spec.title}.`);
      }
      if (attempt.status !== 'skipped' && (typeof attempt.duration !== 'number' || !Number.isFinite(attempt.duration) || attempt.duration < 0)) {
        throw new Error(`Playwright omitted a measured duration for ${test.id}.`);
      }
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
  if (!/^[a-zA-Z0-9-]+$/.test(input.id)) throw new Error('Invalid execution ID.');
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
    const overlayRoot = `${resolve(overlay)}${sep}`;
    for (const edit of input.edits) {
      const target = resolve(overlay, edit.path);
      if (!target.startsWith(overlayRoot)) throw new Error(`Edit escapes the execution overlay: ${edit.path}`);
      writeFileSync(target, edit.content, 'utf8');
    }
    const environment = runnerEnvironment();
    const install = await command(overlay, 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], environment);
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
        ? await command(overlay, 'pnpm', ['exec', 'vitest', 'run', ...files, '--testNamePattern', `^${pattern}`, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`], environment)
        : await command(overlay, process.execPath, ['scripts/e2e.mjs', ...files, '--grep', pattern, '--reporter=list,json'], runnerEnvironment(environment, { PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }));
      let parsed: TestExecution[] = [];
      try { parsed = runner === 'vitest' ? parseVitest(reportPath, tests, result.output) : parsePlaywright(reportPath, tests, result.output); }
      catch { /* Missing or malformed reports become explicit failed results below. */ }
      completeGroup(execution, parsed, ids, result.output);
      if (result.code !== 0 && parsed.every(test => test.status !== 'failed')) throw new Error(`${runner} exited with code ${result.code} without reporting a failed requested test.\n${result.output}`);
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
