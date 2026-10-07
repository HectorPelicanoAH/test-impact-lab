import { expect, test } from 'vitest';
import config from '../../impact/discovery.json';
import { GraphBuilder, canonical, delta, hash, nodeId, sourceText, validateSnapshot } from '../../scripts/graph/core';
import { extractTypescript } from '../../scripts/graph/extract';
import { buildArchive, loadWorkspace } from '../../scripts/graph/snapshot';
import { applyEdits } from '../../scripts/graph/files';

const fixtureConfig = { ...config, roots: ['src'], moduleAliases: { '@one': 'src/one.ts' } };
const files = {
  'src/one.ts': 'export function same() { return 1; }',
  'src/two.ts': 'export function same() { return 2; }',
  'src/page.tsx': "import { same as first } from '@one';\nimport { same as second } from './two';\nexport function Page() { first(); second(); return null; }",
  'src/orphan.ts': 'export const value = 1;',
};

test('compiler resolves aliases and homonyms with exact occurrence evidence', () => {
  const builder = new GraphBuilder(files, fixtureConfig, {});
  extractTypescript(builder);
  const calls = [...builder.edges.values()].filter(edge => edge.type === 'calls');
  expect(calls).toHaveLength(2);
  for (const edge of calls) {
    const evidence = builder.evidence.get(edge.evidenceIds[0]!)!;
    const call = sourceText(evidence.locator, files);
    expect(builder.nodes.get(edge.to)?.locations[0]?.path).toBe(call === 'first()' ? 'src/one.ts' : 'src/two.ts');
  }
  expect(builder.nodes.has(nodeId(fixtureConfig, 'file', 'src/orphan.ts'))).toBe(true);
});

test('unsupported dynamic references and syntax errors are diagnoses, never guessed edges', () => {
  const input = { 'src/dynamic.ts': 'export const run = (name: string) => import(name);', 'src/broken.ts': 'export const broken = (' };
  const builder = new GraphBuilder(input, fixtureConfig, {});
  extractTypescript(builder);
  expect([...builder.diagnostics.values()].map(item => item.code)).toEqual(expect.arrayContaining(['dynamic-reference', 'parse-failed']));
  expect([...builder.edges.values()].some(edge => edge.type !== 'contains' && builder.evidence.get(edge.evidenceIds[0]!)?.locator.kind === 'source'
    && sourceText(builder.evidence.get(edge.evidenceIds[0]!)?.locator, input).includes('import(name)'))).toBe(false);
});

test('Route binding uses an imported supported component, not a matching local name', () => {
  const input = { ...files, 'src/routes.tsx': "import { Route as R } from 'react-router-dom';\nimport { Page } from './page';\nexport const Routes = () => <R path='/new' element={<Page />} />;" };
  const builder = new GraphBuilder(input, fixtureConfig, {});
  extractTypescript(builder);
  expect([...builder.edges.values()].filter(edge => edge.type === 'routes')).toHaveLength(1);
  const fake = new GraphBuilder({ 'src/fake.tsx': "function Route(p: any) { return null; } export const X = () => <Route path='/fake' element={<Route />} />;" }, fixtureConfig, {});
  extractTypescript(fake);
  expect([...fake.edges.values()].some(edge => edge.type === 'routes')).toBe(false);
});

test('overlay CRUD checks operation, traversal, case/Unicode and file-directory collisions', () => {
  const add = { path: 'src/new/Page.tsx', operation: 'add' as const, content: 'export const Page = () => null;' };
  expect(applyEdits(files, [add], fixtureConfig)[add.path]).toBe(add.content);
  expect(applyEdits(files, [{ path: 'src/orphan.ts', operation: 'delete' }], fixtureConfig)['src/orphan.ts']).toBeUndefined();
  for (const path of ['../escape.ts', 'src/../escape.ts', 'src/%2e%2e/x.ts', '/src/x.ts', 'src\\x.ts', 'src/.hidden.ts', 'src/ONE.ts', 'src/one.ts/nested.ts']) {
    expect(() => applyEdits(files, [{ ...add, path }], fixtureConfig), path).toThrow();
  }
  expect(() => applyEdits(files, [{ ...add, path: 'src/one.ts' }], fixtureConfig)).toThrow();
  expect(() => applyEdits(files, [{ path: 'src/unknown.ts', content: '' }], fixtureConfig)).toThrow();
  expect(() => applyEdits(files, [{ path: 'src/unknown.ts', operation: 'delete' }], fixtureConfig)).toThrow();
  expect(() => applyEdits({ 'src/café.ts': '' }, [{ ...add, path: 'src/cafe\u0301.ts' }], fixtureConfig)).toThrow(/collision/);
});

test('migration preserves every legacy policy and test subject without pretending measured coverage', () => {
  const workspace = loadWorkspace(process.cwd());
  const archive = buildArchive(workspace);
  const migrated = archive.graph.edges.filter(edge => edge.qualifiers.legacyId);
  expect(migrated).toHaveLength(workspace.legacyGraph.edges.length);
  for (const old of workspace.legacyGraph.edges) {
    const edge = migrated.find(edge => edge.qualifiers.legacyId === old.id)!;
    expect(archive.graph.policies.find(policy => policy.id === edge.policyRef)?.configuration).toEqual(old.policy);
    if (old.type === 'exercises') expect(archive.graph.evidence.find(item => item.id === edge.evidenceIds[0])?.kind).toBe('reviewed-declaration');
  }
  expect(archive.graph.nodes.filter(node => node.legacyId)).toHaveLength(workspace.legacyGraph.nodes.length);
  expect(archive.graph.evidence.some(item => item.kind === 'measured-coverage')).toBe(false);
  validateSnapshot(archive.graph, archive.sources, archive.configuration);
  const reversed = buildArchive({ ...workspace, sources: Object.fromEntries(Object.entries(workspace.sources).reverse()) });
  expect(reversed.graph.id).toBe(archive.graph.id);
  expect(canonical(reversed.graph)).toBe(canonical(archive.graph));
  const stale = structuredClone(archive.graph);
  stale.evidence[0]!.revision = 'unknown';
  expect(() => validateSnapshot(stale, archive.sources, archive.configuration)).toThrow();
  const unattested = structuredClone(archive.graph);
  unattested.edges[0]!.evidenceIds = [];
  expect(() => validateSnapshot(unattested, archive.sources, archive.configuration)).toThrow();
});

test('adding, connecting, modifying and deleting a screen produces real topology deltas', () => {
  const baseline = buildArchive(loadWorkspace(process.cwd()));
  const path = 'apps/frontend/src/NewPage.tsx';
  const source = "import { LoginButton } from './components/LoginButton';\nexport function NewPage() { return <LoginButton pending={false} />; }";
  const added = buildArchive({ ...baseline, sources: applyEdits(baseline.sources, [{ path, operation: 'add', content: source }], config) });
  expect(delta(baseline.graph, added.graph).nodes.added.some(node => node.locations[0]?.path === path)).toBe(true);
  expect(added.graph.edges.some(edge => edge.type === 'renders' && added.graph.nodes.find(node => node.id === edge.from)?.locations[0]?.path === path)).toBe(true);
  const modified = buildArchive({ ...added, sources: applyEdits(added.sources, [{ path, content: 'export function NewPage() { return null; }' }], config) });
  expect(delta(added.graph, modified.graph).edges.removed.some(edge => edge.type === 'renders')).toBe(true);
  const removed = buildArchive({ ...modified, sources: applyEdits(modified.sources, [{ path, operation: 'delete' }], config) });
  expect(delta(modified.graph, removed.graph).nodes.removed.some(node => node.locations[0]?.path === path)).toBe(true);
  expect(removed.graph.id).toBe(baseline.graph.id);
  expect(hash(baseline.sources[path] ?? '')).toBe(hash(''));
});