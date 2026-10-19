import { FORMAT, hash, normalizeSnapshot } from './core.mjs';

// This bridge imports inspection data, not impact policies or test-selection
// guarantees. Original evidence remains available in its own record.
export function importV2(input, { includeSources = false } = {}) {
  const graph = input.graph ?? input;
  if (graph.schemaVersion !== 2 || !Array.isArray(graph.repositories)) throw new Error('Expected a v2 graph or v2 archive.');
  const classes = {
    static: 'static', configuration: 'configuration', 'reviewed-declaration': 'declaration',
    'measured-coverage': 'measured-coverage', observation: 'observation'
  };
  if (!Array.isArray(graph.evidence)) throw new Error('Missing v2 evidence.');
  const evidence = graph.evidence.map(item => {
    if (!classes[item.kind]) throw new Error('Unknown v2 evidence kind: ' + item.kind);
    return { ...item, kind: classes[item.kind], originalKind: item.kind };
  });
  const sources = Object.create(null);
  if (includeSources) {
    for (const [path, content] of Object.entries(input.sources ?? {})) sources[path] = content;
    for (const [path, content] of Object.entries(input.configuration ?? {})) {
      if (Object.hasOwn(sources, path) && sources[path] !== content) throw new Error('Conflicting source: ' + path);
      sources[path] = content;
    }
    for (const item of evidence) {
      const locator = item.locator;
      if (locator?.path && Object.hasOwn(sources, locator.path) && locator.sourceHash && hash(sources[locator.path]) !== locator.sourceHash) {
        throw new Error('Archived source hash mismatch: ' + locator.path);
      }
    }
  }
  return normalizeSnapshot({
    format: FORMAT,
    metadata: {
      title: 'Imported dependency graph',
      origin: 'lab-v2',
      originalSnapshotId: graph.id ?? null,
      repositories: graph.repositories,
      use: 'inspection-only',
      integrity: 'View structure validated; original archive identity and selection policies are not certified.',
      note: 'Reviewed subjects remain declarations. This import is not a measured baseline.'
    },
    nodes: graph.nodes,
    edges: graph.edges,
    evidence,
    diagnostics: graph.diagnostics ?? [],
    sources
  });
}
