import type { GraphEdge, ImpactGraph, ImpactInput, ImpactResult, PathStep, SelectionReason, TestMetadata, TraversalMode } from './schema';

export * from './schema';
export { analyzeSourceEdits, type SourceAnalysisResult } from './analysis';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (values: Iterable<string>) => [...new Set(values)].sort(compare);

export function validateGraph(graph: ImpactGraph, catalogue: TestMetadata[]): void {
  if (graph.schemaVersion !== 1) throw new Error('Unsupported graph version');
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (nodes.size !== graph.nodes.length) throw new Error('Duplicate node ID');
  if (new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length) throw new Error('Duplicate edge ID');
  if (new Set(catalogue.map(test => test.id)).size !== catalogue.length) throw new Error('Duplicate test ID');
  if (new Set(catalogue.map(test => `${test.runner}\0${test.file}\0${test.title}`)).size !== catalogue.length) throw new Error('Duplicate runner test identity');
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new Error(`Dangling edge: ${edge.id}`);
    if (!edge.evidence.reason || !edge.evidence.source) throw new Error(`Missing evidence: ${edge.id}`);
    if (['frontend', 'backend'].includes(from.side) && ['frontend', 'backend'].includes(to.side) && from.side !== to.side) {
      throw new Error(`Cross-side edge bypasses contract: ${edge.id}`);
    }
    if (from.kind === 'test' && (edge.type !== 'exercises' || to.kind === 'test')) throw new Error(`Invalid test edge: ${edge.id}`);
    if (to.kind === 'test') throw new Error(`Tests cannot be production dependencies: ${edge.id}`);
  }
  for (const test of catalogue) {
    if (!['vitest', 'playwright'].includes(test.runner)) throw new Error(`Invalid test runner: ${test.id}`);
    if (!test.file || test.file.startsWith('/') || test.file.startsWith('-') || test.file.includes('\\') || test.file.split('/').includes('..')) {
      throw new Error(`Unsafe test file: ${test.id}`);
    }
    if (!test.title.startsWith(`[${test.id}] `)) throw new Error(`Test title does not contain its stable ID: ${test.id}`);
    const node = nodes.get(test.nodeId);
    if (node?.kind !== 'test' || node.testId !== test.id) throw new Error(`Missing test node: ${test.id}`);
    if (!graph.edges.some(edge => edge.from === test.nodeId && edge.type === 'exercises' && edge.policy.reverseImpact)) {
      throw new Error(`Missing local test relationship: ${test.id}`);
    }
  }
  for (const node of nodes.values()) {
    if (node.kind === 'test' && !catalogue.some(test => test.nodeId === node.id)) throw new Error(`Uncatalogued test: ${node.id}`);
    if (node.kind === 'contract' && node.side !== 'boundary') throw new Error(`Invalid contract side: ${node.id}`);
  }
}

interface Visit { node: string; mode: TraversalMode; origin: string; path: PathStep[] }

/** Pure traversal of validated local evidence; no scenario names or test lists. */
export function calculateImpact(input: ImpactInput): ImpactResult {
  const { graph, catalogue } = input;
  validateGraph(graph, catalogue);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const tests = new Map(catalogue.map(test => [test.nodeId, test]));
  const changed = sorted(input.changedEntityIds);
  const warnings = sorted([
    ...input.uncertaintyReasons,
    ...changed.filter(id => !nodes.has(id)).map(id => `Unmapped changed entity: ${id}`),
    ...(input.diff.length > 0 && changed.length === 0 ? ['Changed files have no entity mapping.'] : []),
  ]);
  if (warnings.length) {
    const selectedTests = sorted(catalogue.map(test => test.id));
    return {
      changedEntities: changed, affectedNodes: sorted(nodes.keys()), journeyNodes: [], selectedTests, excludedTests: [], boundaries: [],
      explanations: selectedTests.map(testId => ({ testId, changedNode: '<uncertain>', path: [], reason: `Conservative full selection: ${warnings.join(' ')}` })),
      warnings, selectionMode: 'conservative-full',
    };
  }
  const edges = [...graph.edges].sort((a, b) => compare(a.id, b.id));
  const affected = new Set<string>();
  const journey = new Set<string>();
  const reasons = new Map<string, SelectionReason>();
  const boundaries = new Map<string, ImpactResult['boundaries'][number]>();
  const blocked = new Map<string, Set<string>>();
  const queue: Visit[] = changed.map(node => ({ node, origin: node, mode: nodes.get(node)?.kind === 'contract' ? 'contract-change' : 'implementation', path: [] }));
  const visited = new Set<string>();
  function enqueue(current: Visit, edge: GraphEdge, direction: PathStep['direction'], mode: TraversalMode) {
    queue.push({ node: direction === 'reverse' ? edge.from : edge.to, origin: current.origin, mode,
      path: [...current.path, { edgeId: edge.id, direction, mode }] });
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    const key = JSON.stringify([current.node, current.mode, current.origin]);
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes.get(current.node)!;
    const test = tests.get(node.id);
    if (current.mode === 'journey-only') journey.add(node.id);
    else if (current.mode !== 'boundary-evidence' || node.kind === 'contract') affected.add(node.id);

    if (test) {
      const eligible = current.mode !== 'boundary-evidence' && (current.mode !== 'journey-only' || test.kind === 'e2e' || test.kind === 'contract');
      if (eligible) {
        const candidate: SelectionReason = { testId: test.id, changedNode: current.origin, path: current.path,
          reason: current.mode === 'journey-only' ? 'Journey or contract evidence across an unchanged boundary.' : 'Reachable from a changed entity through local evidence.' };
        const previous = reasons.get(test.id);
        if (!previous || candidate.path.length < previous.path.length || (candidate.path.length === previous.path.length && compare(JSON.stringify(candidate), JSON.stringify(previous)) < 0)) {
          reasons.set(test.id, candidate);
        }
      } else if (current.mode === 'journey-only') {
        const contracts = current.path.flatMap(step => {
          const edge = edges.find(edge => edge.id === step.edgeId)!;
          return [edge.from, edge.to].filter(id => nodes.get(id)?.kind === 'contract');
        });
        blocked.set(test.id, new Set([...(blocked.get(test.id) ?? []), ...contracts]));
      }
      continue;
    }

    let mode = current.mode;
    if (node.kind === 'contract') {
      const crossed = changed.includes(node.id);
      boundaries.set(JSON.stringify([node.id, current.origin]), { contractId: node.id, origin: current.origin, crossed,
        reason: crossed ? 'Contract changed; relevant implementation on both sides is exposed.' : 'API contract unchanged; only contract and journey evidence crosses this boundary.' });
      mode = crossed ? 'contract-change' : 'journey-only';
    }
    for (const edge of edges) {
      if (mode !== 'boundary-evidence' && edge.to === node.id && edge.policy.reverseImpact) {
        enqueue(current, edge, 'reverse', mode === 'contract-change' ? 'implementation' : mode);
      }
      if ((mode === 'implementation' || mode === 'boundary-evidence') && edge.from === node.id && edge.policy.forwardBoundaryEvidence) {
        enqueue(current, edge, 'forward', 'boundary-evidence');
      }
      if (mode === 'contract-change' && edge.policy.contractExposure) {
        if (edge.from === node.id) enqueue(current, edge, 'forward', 'contract-change');
        if (edge.to === node.id) enqueue(current, edge, 'reverse', 'contract-change');
      }
    }
  }
  const selectedTests = sorted(reasons.keys());
  return {
    changedEntities: changed,
    affectedNodes: sorted(affected),
    journeyNodes: sorted([...journey].filter(id => !affected.has(id))),
    selectedTests,
    excludedTests: [...catalogue].sort((a, b) => compare(a.id, b.id)).filter(test => !reasons.has(test.id)).map(test => ({
      testId: test.id, reason: blocked.has(test.id) ? 'boundary-stopped' : 'unreachable',
      boundaryIds: sorted(blocked.get(test.id) ?? []),
      explanation: blocked.has(test.id) ? 'Only journey evidence reaches this test; the unchanged contract blocks implementation propagation.' : 'No permitted dependency path from the changed entities.',
    })),
    boundaries: [...boundaries.values()].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    explanations: selectedTests.map(id => reasons.get(id)!), warnings: [], selectionMode: 'graph',
  };
}
