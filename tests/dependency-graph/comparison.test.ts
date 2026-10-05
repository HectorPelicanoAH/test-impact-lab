import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import cgc from '../../impact/corpus/g1/results/cgc.json';
import report from '../../impact/corpus/g1/results/comparison.json';
import { compareCgc } from '../../scripts/g1/compare';
import { digest, evolve, extract, loadCorpus, score } from '../../scripts/g1/corpus';

test('checked-in evidence is bound to the current corpus, oracle and chosen extractor', () => {
  const baseline = extract(loadCorpus());
  expect(cgc.status).toBe('executed');
  expect(cgc.checkoutUnchanged).toBe(true);
  expect(cgc.inputFiles).toEqual(baseline.files);
  expect(cgc.evolvedFiles).toEqual(extract(evolve(loadCorpus())).files);
  expect(report.oracleHash).toBe(digest(readFileSync('impact/corpus/g1/oracle.json', 'utf8')));
  expect(report.typescript.baseline).toEqual(baseline);
  expect(report.typescript.evaluation).toEqual(score(baseline));
  expect(report.cgc.evaluation).toEqual(compareCgc(cgc.baseline.edges));
});

test('CGC homonym error is recorded, not accepted or hidden by name matching', () => {
  const evaluation = compareCgc(cgc.baseline.edges);
  expect(evaluation.falseLinks).toContainEqual(expect.objectContaining({ text: 'second()', to: 'lib/one.ts#same' }));
  expect(evaluation.metrics.calls).toMatchObject({ truePositives: 4, falsePositives: 1, falseNegatives: 4, precision: 0.8, recall: 0.5 });
  expect(evaluation.authoritativeV2EdgesAdmitted).toBe(0);
});

test('heuristics and unresolved module names never become proven source dependencies', () => {
  const evaluation = compareCgc(cgc.baseline.edges);
  expect(evaluation.unresolved.some(item => item.raw.type === 'HEURISTIC_CALLS')).toBe(true);
  expect(evaluation.unresolved.some(item => item.raw.type === 'IMPORTS' && item.raw.toName === '@lib/one')).toBe(true);
  expect(evaluation.candidates.some(item => item.from === 'main.ts#viaPort')).toBe(false);
  expect(evaluation.candidates.some(item => item.from === 'main.ts#invoke')).toBe(false);
});

test('CGC update and forced rebuild agree on exported nodes and relationships after evolution', () => {
  expect(cgc.updateEqualsRebuild).toBe(true);
  expect(cgc.updated).toEqual(cgc.rebuilt);
  const paths = cgc.updated.nodes.map(node => node.path);
  expect(paths).toContain('./added.ts');
  expect(paths).toContain('./lib/renamed-two.ts');
  expect(paths).not.toContain('./orphan.ts');
  expect(paths).not.toContain('./lib/two.ts');
  expect(cgc.updated.edges.some(edge => edge.text === 'direct()' && edge.fromPath === './added.ts')).toBe(true);
});

test('evaluator diagnoses omitted results rather than attributing native diagnostics to CGC', () => {
  const empty = compareCgc([]);
  expect(empty.metrics.calls!.recall).toBe(0);
  expect(empty.metrics.calls!.precision).toBeNull();
  expect(empty.cases.every(item => item.status === 'diagnostic-by-evaluator')).toBe(true);
  expect(empty.diagnosticOrigin).toBe('G1 evaluator, not CGC');
});