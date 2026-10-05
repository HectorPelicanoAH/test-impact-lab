import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch, release } from 'node:os';
import ts from 'typescript';
import { extract, loadCorpus, evolve, score, digest } from './corpus';
import { compareCgc, type CgcEdge } from './compare';

const files = loadCorpus();
const start = performance.now();
const baseline = extract(files);
const baselineMs = performance.now() - start;
const nextFiles = evolve(files);
const nextStart = performance.now();
const next = extract(nextFiles);
const evolvedRebuildMs = performance.now() - nextStart;
const evaluation = score(baseline);
const cgc = JSON.parse(readFileSync('impact/corpus/g1/results/cgc.json', 'utf8')) as {
  status: string; version: string; inputFiles: Record<string, string>; baseline: { edges: CgcEdge[] };
};
if (cgc.status !== 'executed') throw new Error('CGC run incomplete; do not manufacture scores.');
if (JSON.stringify(cgc.inputFiles) !== JSON.stringify(baseline.files)) throw new Error('CGC and TypeScript corpus revisions differ.');
const report = {
  schemaVersion: 1, corpusVersion: 1,
  oracleHash: digest(readFileSync('impact/corpus/g1/oracle.json', 'utf8')),
  machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  size: { files: Object.keys(files).length, bytes: Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0),
    lines: Object.values(files).reduce((sum, text) => sum + text.split('\n').length, 0) },
  typescript: { version: ts.version, node: process.version, extractor: 'typescript-checker-g1@1',
    baselineMs, evolvedRebuildMs, evaluation, baseline, evolved: next,
    deterministic: JSON.stringify(baseline) === JSON.stringify(extract(Object.fromEntries(Object.entries(files).reverse()))),
    updateMode: 'full rebuild only; incremental/watch intentionally deferred to G2',
    delta: { addedNodes: next.nodes.filter(node => !baseline.nodes.includes(node)),
      removedNodes: baseline.nodes.filter(node => !next.nodes.includes(node)),
      changedFiles: Object.keys(files).filter(path => next.files[path] && next.files[path] !== baseline.files[path]) } },
  cgc: { version: cgc.version, rawEvidence: 'cgc.json', evaluation: compareCgc(cgc.baseline.edges) },
};
mkdirSync('impact/corpus/g1/results', { recursive: true });
writeFileSync('impact/corpus/g1/results/comparison.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ typescript: report.typescript.evaluation.metrics, cgc: report.cgc.evaluation.metrics,
  baselineMs, evolvedRebuildMs, deterministic: report.typescript.deterministic }, null, 2));
if (evaluation.falseLinks.length || evaluation.unexpectedDiagnostics.length || evaluation.cases.some(item => item.status === 'missing') || !report.typescript.deterministic) {
  throw new Error('G1 chosen extractor failed acceptance.');
}