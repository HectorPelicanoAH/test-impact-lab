import { describe, expect, test } from 'vitest';
import oracle from '../../impact/corpus/g1/oracle.json';
import { extract, loadCorpus, evolve, score, digest } from '../../scripts/g1/corpus';

const files = loadCorpus();
const result = extract(files);
const evaluation = score(result);

describe('G1 isolated discovery experiment (not the production generator)', () => {
  test.each([...oracle.relations, ...oracle.diagnostics])('$case is resolved or explicitly diagnosed', item => {
    const verdict = evaluation.cases.find(candidate => candidate.case === item.case);
    expect(verdict, item.case).toBeDefined();
    expect(['resolved', 'diagnostic'], JSON.stringify(verdict)).toContain(verdict!.status);
  });

  test('rejects every unexpected or false authoritative occurrence', () => {
    expect(evaluation.falseLinks).toEqual([]);
    expect(evaluation.unexpectedDiagnostics).toEqual([]);
    for (const forbidden of oracle.forbidden) {
      expect(result.relations.some(edge => edge.type === forbidden.type && edge.from === forbidden.from && edge.to === forbidden.to)).toBe(false);
    }
  });

  test('the oracle is not allowed to hide an incorrect relation', () => {
    const bad = { ...result.relations[0]!, to: 'wrong.ts#same' };
    expect(score({ ...result, relations: [...result.relations, bad] }).falseLinks).toContainEqual(bad);
  });

  test('a missing relation without a diagnosis fails the acceptance gate', () => {
    const omitted = score({ ...result, relations: [] });
    expect(omitted.cases.some(item => item.status === 'missing')).toBe(true);
  });

  test('all provenance ranges reproduce the actual source text', () => {
    for (const item of [...result.relations, ...result.diagnostics]) {
      expect(files[item.path]!.slice(item.start, item.end)).toBe(item.text);
      expect(item.line).toBe(files[item.path]!.slice(0, item.start).split('\n').length);
      expect(item.sourceHash).toBe(digest(files[item.path]!));
      expect(item.extractor).toBe('typescript-checker-g1@1');
    }
    for (const item of [...oracle.relations, ...oracle.diagnostics]) {
      expect(files[item.path]!.split('\n')[item.line - 1]).toContain(item.text.split('\n')[0]);
    }
  });

  test('reports omissions in recall instead of scoring a diagnostic as a true positive', () => {
    expect(evaluation.metrics.calls).toMatchObject({ expected: 8, truePositives: 5, falsePositives: 0, falseNegatives: 3, precision: 1, recall: 5 / 8 });
  });

  test('equivalent input order gives identical normalized facts and hash', () => {
    expect(extract(Object.fromEntries(Object.entries(files).reverse()))).toEqual(result);
  });

  test('disconnected files are visible and parse failure produces no facts from recovery', () => {
    expect(result.nodes).toContain('orphan.ts#disconnected');
    expect(result.nodes).toContain('broken.ts');
    expect(result.relations.some(edge => edge.path === 'broken.ts')).toBe(false);
  });

  test('full rebuild covers additions, modifications, removals and rename as remove/add', () => {
    const nextFiles = evolve(files);
    const next = extract(nextFiles);
    expect(next.nodes).toContain('added.ts#added');
    expect(next.relations).toContainEqual(expect.objectContaining({ type: 'calls', from: 'added.ts#added', to: 'main.ts#direct' }));
    expect(next.nodes).not.toContain('orphan.ts');
    expect(next.nodes).not.toContain('lib/two.ts#same');
    expect(next.nodes).toContain('lib/renamed-two.ts#same');
    expect(next.relations).toContainEqual(expect.objectContaining({ type: 'calls', from: 'main.ts#direct', to: 'lib/renamed-two.ts#same' }));
    expect(next.files['widget.tsx']).not.toBe(result.files['widget.tsx']);
    expect(next.hash).not.toBe(result.hash);
    expect(extract(nextFiles)).toEqual(next);
    expect(files['orphan.ts']).toBeDefined(); // never mutate the baseline
  });
});