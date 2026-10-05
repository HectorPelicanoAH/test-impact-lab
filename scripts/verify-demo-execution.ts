import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeSourceEdits, type ImpactGraph, type TestMetadata } from '../packages/impact-engine/src/index';
import { executeTests } from '../apps/demo/execution';
import { applySuggestion, suggestions } from '../apps/demo/src/suggestions';

const root = resolve(process.cwd());
const graph = JSON.parse(readFileSync(resolve(root, 'impact/graph.json'), 'utf8')) as ImpactGraph;
const catalogue = JSON.parse(readFileSync(resolve(root, 'impact/catalogue.json'), 'utf8')) as TestMetadata[];
const originalFiles = Object.fromEntries([...new Set(graph.nodes.flatMap(node => node.kind !== 'test' && node.source ? [node.source.path] : []))]
  .map(path => [path, readFileSync(resolve(root, path), 'utf8')]));
const suggestion = suggestions.find(candidate => candidate.id === 'domain')!;
const edits = [{ path: suggestion.path, content: applySuggestion(originalFiles[suggestion.path]!, suggestion) }];
const analysis = analyzeSourceEdits({ originalFiles, edits, graph, catalogue });
if (analysis.result.selectedTests.length !== 13) throw new Error(`Expected 13 selected tests, got ${analysis.result.selectedTests.length}.`);
const original = readFileSync(resolve(root, suggestion.path), 'utf8');

for (const mode of ['selected', 'full'] as const) {
  const ids = new Set(mode === 'selected' ? analysis.result.selectedTests : catalogue.map(test => test.id));
  const tests = catalogue.filter(test => ids.has(test.id));
  const result = await executeTests({
    id: `verification-${mode}-${Date.now()}`,
    analysisId: 'verification-analysis',
    snapshotId: 'verification-snapshot',
    mode,
    root,
    edits,
    tests,
    onUpdate() {},
  });
  if (result.results.length !== tests.length) throw new Error(`${mode} returned ${result.results.length}/${tests.length} results.`);
  if (result.results.some(test => ['queued', 'running'].includes(test.status))) throw new Error(`${mode} left unfinished tests.`);
  if (result.results.some(test => test.durationMs === undefined)) throw new Error(`${mode} is missing measured test durations.`);
  console.log(`${mode}: ${result.results.filter(test => test.status === 'passed').length} passed, ${result.results.filter(test => test.status === 'failed').length} failed, ${result.durationMs?.toFixed(0)} ms.`);
}

if (readFileSync(resolve(root, suggestion.path), 'utf8') !== original) throw new Error('Execution modified the checkout.');
console.log('Selected and full executions completed in isolated overlays; checkout unchanged.');
