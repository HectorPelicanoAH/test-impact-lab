import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { TestMetadata } from '@test-impact/impact-engine';
import type { DemoExecution, ExecutionMode, TestExecution } from './src/types';
import type { DiscoveryConfig, OverlayEdit, SourceFiles } from '../../packages/impact-engine/src/schema-v2';
import type { FederatedSuite } from '../../packages/impact-engine/src/federated';
import discoveryConfig from '../../impact/discovery.json';
import { applyEdits, authorizedPath, readTree, safePath } from '../../scripts/graph/files';
import { executionEntries, ignoreExecution } from '../../scripts/graph/snapshot';

export interface RunInput {
  id: string;
  analysisId: string;
  snapshotId: string;
  mode: ExecutionMode;
  root: string;
  edits: OverlayEdit[];
  sourceSnapshot?: SourceFiles;
  discoveryConfig?: DiscoveryConfig;
  tests: TestMetadata[];
  federatedSuites?: FederatedSuite[];
  onUpdate: (execution: DemoExecution) => void;
}

interface CommandResult { code: number; output: string; durationMs: number }
const MAX_OUTPUT = 12_000;
const environmentKeys = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'ComSpec', 'PATHEXT', 'LOCALAPPDATA', 'APPDATA', 'PNPM_HOME', 'COREPACK_HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'LC_ALL', 'TZ', 'CI'] as const;

export function runnerEnvironment(source: NodeJS.ProcessEnv = process.env, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of environmentKeys) if (source[key] !== undefined) environment[key] = source[key];
  return { ...environment, ...extra };
}

/** Materialize only captured bytes, not symlinks or mutable checkout files. Destination must be a fresh temp directory. */
export function materializeOverlay(directory: string, captured: SourceFiles, edits: OverlayEdit[], config: DiscoveryConfig = discoveryConfig) {
  const product = Object.fromEntries(Object.entries(captured).filter(([path]) => authorizedPath(path, config)));
  const edited = applyEdits(product, edits, config);
  const finalFiles = { ...captured };
  for (const path of Object.keys(product)) if (edited[path] === undefined) delete finalFiles[path];
  Object.assign(finalFiles, edited);
  for (const [path, content] of Object.entries(finalFiles)) {
    const target = resolve(directory, path);
    if (!safePath(path) || !target.startsWith(`${resolve(directory)}${sep}`)) throw new Error(`Source escapes execution overlay: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
  }
}

function snapshot(execution: DemoExecution): DemoExecution {
  return { ...execution, results: execution.results.map(result => ({ ...result })),
    suiteResults: execution.suiteResults?.map(result => ({ ...result })) };
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

function federatedReportStatus(path: string, browser: boolean, exitCode: number): 'passed' | 'failed' | 'skipped' {
  const report = JSON.parse(readFileSync(path, 'utf8')) as {
    testResults?: { assertionResults?: { status: string }[] }[];
    suites?: { suites?: unknown[]; specs?: { tests?: { results?: { status: string }[] }[] }[] }[];
  };
  const statuses: string[] = [];
  if (browser) {
    const visit = (suite: { suites?: unknown[]; specs?: { tests?: { results?: { status: string }[] }[] }[] }) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) statuses.push(test.results?.at(-1)?.status ?? 'missing');
      }
      for (const child of suite.suites ?? []) visit(child as typeof suite);
    };
    visit(report);
  } else {
    for (const file of report.testResults ?? []) for (const assertion of file.assertionResults ?? []) statuses.push(assertion.status);
  }
  if (!statuses.length) throw new Error('No tests were reported by the federated runner.');
  if (exitCode !== 0 || statuses.some(status => !['passed', 'skipped', 'pending'].includes(status))) return 'failed';
  return statuses.every(status => status === 'skipped' || status === 'pending') ? 'skipped'
    : statuses.some(status => status === 'skipped' || status === 'pending') ? 'skipped' : 'passed';
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
    suiteResults: (input.federatedSuites ?? []).map(item => ({ id: item.id, file: item.file,
      availability: item.file.startsWith('external/inventory/') && input.sourceSnapshot?.[item.file] === undefined ? 'source-inaccessible' as const
        : item.runner.startsWith('broker-') && (!process.env.BROKER_URL || (item.runner === 'broker-vitest' && !process.env.G5_BROKER_CONTAINER))
          ? 'broker-required' as const : 'available' as const,
      status: 'queued' as const })),
  };
  publish(execution, input.onUpdate);
  const overlay = mkdtempSync(join(tmpdir(), 'test-impact-lab-'));
  const evidence = resolve(input.root, '.impact-runs', input.id);
  mkdirSync(evidence, { recursive: true });
  const preparationStarted = performance.now();
  let executionStarted: number | undefined;
  try {
    materializeOverlay(overlay, input.sourceSnapshot ?? readTree(input.root, executionEntries, ignoreExecution), input.edits, input.discoveryConfig ?? discoveryConfig);
    const environment = runnerEnvironment();
    const installEnvironment = runnerEnvironment(environment, { CI: 'true' });
    let install = await command(overlay, 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], installEnvironment);
    if (install.code !== 0 && install.output.includes('ERR_PNPM_NO_OFFLINE_TARBALL')) {
      install = await command(overlay, 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], installEnvironment);
    }
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
    for (const suite of input.federatedSuites ?? []) {
      const entry = execution.suiteResults?.find(item => item.id === suite.id)!;
      if (entry.availability !== 'available') {
        entry.status = 'unavailable'; entry.output = entry.availability === 'broker-required' ? 'RabbitMQ profile is not available for this execution.' : 'External repository source is inaccessible.';
        publish(execution, input.onUpdate); continue;
      }
      entry.status = 'running'; publish(execution, input.onUpdate);
      const reportPath = resolve(evidence, `suite-${suite.id}.json`);
      const external = suite.runner === 'node-test';
      const browser = suite.runner === 'playwright' || suite.runner === 'broker-playwright';
      const env = runnerEnvironment(environment, {
        ...(input.sourceSnapshot?.['external/inventory/package.json'] ? { INVENTORY_ROOT: resolve(overlay, 'external/inventory') } : {}),
        ...(suite.runner.startsWith('broker-') && process.env.BROKER_URL ? { BROKER_URL: process.env.BROKER_URL,
          ...(process.env.G5_BROKER_CONTAINER ? { G5_BROKER_CONTAINER: process.env.G5_BROKER_CONTAINER } : {}) } : {}),
      });
      const result = external
        ? await command(resolve(overlay, 'external/inventory'), process.execPath, ['--experimental-strip-types', '--test', '--test-reporter=tap', suite.file.slice('external/inventory/'.length)], env)
        : browser
          ? await command(overlay, process.execPath, ['scripts/e2e.mjs', suite.file, '--reporter=list,json'], runnerEnvironment(env, { PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }))
          : await command(overlay, 'pnpm', ['exec', 'vitest', 'run', suite.file, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`], env);
      entry.durationMs = result.durationMs;
      try {
        if (!external) {
          entry.status = federatedReportStatus(reportPath, browser, result.code);
        } else {
          const count = Number(result.output.match(/^# tests (\d+)$/m)?.[1] ?? 0);
          if (!count) throw new Error('No tests were reported by the external runner.');
          entry.status = result.code === 0 ? 'passed' : 'failed';
        }
      } catch (error) { entry.status = 'failed'; entry.output = error instanceof Error ? error.message : 'Invalid runner report.'; }
      if (entry.status !== 'passed') entry.output = entry.output ?? result.output;
      publish(execution, input.onUpdate);
    }
    execution.status = execution.results.some(result => result.status === 'failed') || (execution.suiteResults ?? []).some(result => result.status === 'failed')
      ? 'failed' : (execution.suiteResults ?? []).some(result => result.status === 'unavailable' || result.status === 'skipped')
        ? 'incomplete' : 'passed';
  } catch (error) {
    execution.status = 'failed';
    execution.error = error instanceof Error ? error.message : 'Test execution failed.';
    execution.results = execution.results.map(result => result.status === 'passed' || result.status === 'failed' || result.status === 'skipped'
      ? result : { ...result, status: 'failed', output: execution.error });
    execution.suiteResults = execution.suiteResults?.map(result => result.status === 'passed' || result.status === 'failed' || result.status === 'skipped' || result.status === 'unavailable'
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
