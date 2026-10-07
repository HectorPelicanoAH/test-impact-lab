import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { buildArchive, loadWorkspace } from './graph/snapshot';
import { SnapshotStore, WorkspaceSnapshots } from './graph/store';
import { fileHashes, hash } from './graph/core';
import { locateSource } from './graph/locator';
import { analyzeOverlay } from './graph/analyze';
import { extract, loadCorpus, score } from './g1/corpus';
import { materializeInventory } from './inventory/materialize.mjs';
import { journeyEdits } from '../apps/demo/src/journeys';

const report = resolve('.impact-runs', `g9-audit-${randomUUID()}`);
const storage = mkdtempSync(resolve(tmpdir(), 'impact-g9-audit-'));
const external = materializeInventory();
mkdirSync(report, { recursive: true });
try {
  const input = loadWorkspace(process.cwd(), external.root);
  const baseline = buildArchive(input);
  const measure = (work: () => unknown) => {
    const milliseconds: number[] = [];
    for (let index = 0; index < 5; index++) { const start = performance.now(); work(); milliseconds.push(performance.now() - start); }
    const ordered = [...milliseconds].sort((a, b) => a - b);
    return { samples: milliseconds, medianMs: ordered[2], minMs: ordered[0], maxMs: ordered[4] };
  };
  const full = measure(() => { assert.equal(buildArchive(loadWorkspace(process.cwd(), external.root)).graph.id, baseline.graph.id); });
  const reordered = buildArchive({ ...input, sources: Object.fromEntries(Object.entries(input.sources).reverse()) });
  assert.equal(reordered.graph.id, baseline.graph.id);
  let inspected = 0;
  for (const edge of baseline.graph.edges) {
    assert.ok(edge.evidenceIds.length > 0);
    for (const evidenceId of edge.evidenceIds) { assert.ok(locateSource(baseline, { evidenceId }), `Uninspectable connection ${edge.id}`); inspected++; }
  }
  for (const node of baseline.graph.nodes) for (let index = 0; index < node.locations.length; index++) assert.ok(locateSource(baseline, { nodeId: node.id, index }));
  assert.equal(new Set(baseline.graph.nodes.map(item => item.id)).size, baseline.graph.nodes.length);
  assert.equal(baseline.graph.nodes.filter(item => item.legacyId).length, input.legacyGraph.nodes.length);
  for (const old of input.legacyGraph.edges) {
    const edge = baseline.graph.edges.find(item => item.qualifiers.legacyId === old.id);
    assert.ok(edge, `Lost login edge ${old.id}`);
    assert.deepEqual(baseline.graph.policies.find(item => item.id === edge.policyRef)?.configuration, old.policy);
  }
  const corpus = score(extract(loadCorpus()));
  assert.equal(corpus.falseLinks.length, 0); assert.equal(corpus.unexpectedDiagnostics.length, 0);
  assert.ok(corpus.cases.every(item => ['resolved', 'diagnostic'].includes(item.status)));
  const overlay = journeyEdits('unresolved', input.sources);
  const overlayRebuild = measure(() => analyzeOverlay(baseline, overlay));
  let loaded = input;
  const workspace = new WorkspaceSnapshots(process.cwd(), new SnapshotStore(storage), () => loaded);
  const unchangedRefresh = measure(() => assert.equal(workspace.refresh().graph.id, baseline.graph.id));
  const changed = analyzeOverlay(baseline, overlay).after;
  const changeRefresh = measure(() => {
    loaded = loaded === input ? { ...input, sources: changed.sources } : input;
    const actual = workspace.refresh();
    assert.equal(actual.graph.id, loaded === input ? baseline.graph.id : changed.graph.id);
  });
  assert.equal(hash(fileHashes(loadWorkspace(process.cwd(), external.root).sources)), hash(fileHashes(input.sources)));
  const sourceValues = Object.values(input.sources);
  const result = { status: 'passed', measuredAt: new Date().toISOString(), snapshotId: baseline.graph.id,
    hardware: { platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), availableMemoryBytes: freemem(), node: process.version },
    dataset: { sourceFiles: sourceValues.length, sourceBytes: sourceValues.reduce((sum, value) => sum + Buffer.byteLength(value), 0), sourceLines: sourceValues.reduce((sum, value) => sum + value.split('\n').length, 0), executionFiles: Object.keys(input.executionFiles).length,
      nodes: baseline.graph.nodes.length, edges: baseline.graph.edges.length, diagnostics: baseline.graph.diagnostics.length, inspectedEvidenceUses: inspected,
      legacyNodes: input.legacyGraph.nodes.length, legacyEdges: input.legacyGraph.edges.length, legacyTests: input.catalogue.length, inventoryRevision: external.revision },
    corpus: { metrics: corpus.metrics, cases: corpus.cases.length, falseLinks: corpus.falseLinks.length },
    timings: { repetitions: 5, fullLoadAndBuild: full, overlayAnalysisFullRebuild: overlayRebuild, unchangedRefreshWithCapturedInput: unchangedRefresh, changedRefreshFullRebuildAndPublish: changeRefresh,
      scope: 'Same-process warmed samples on this machine. Full includes filesystem reads; refresh uses a captured-input loader to isolate fingerprint/build/store costs. Changes rebuild the entire index; partial incremental indexing is not implemented. No universal timing claim.' },
    invariants: ['all edge evidence and node locators readable', 'input ordering deterministic', 'unique node identities', 'all legacy policies and subjects preserved', 'corpus false links zero; diagnosed omissions remain in recall', 'checkout sources unchanged'] };
  writeFileSync(resolve(report, 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2)); console.log(`G9 audit: ${report}`);
} finally { rmSync(storage, { recursive: true, force: true }); rmSync(external.root, { recursive: true, force: true }); }
