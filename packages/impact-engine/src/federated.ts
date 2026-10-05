import type { DiscoveryArchive, EdgeV2, GraphSnapshotV2, NodeV2, OverlayEdit } from './schema-v2';

export interface FederatedSuite {
  id: string;
  file: string;
  runner: 'vitest' | 'playwright' | 'node-test' | 'broker-vitest' | 'broker-playwright';
  subjects: string[];
}
export interface SuiteDecision {
  id: string;
  file: string;
  availability: 'available' | 'broker-required' | 'source-inaccessible';
  selected: boolean;
  reason: string;
  path: { edgeId: string; direction: 'forward' | 'reverse' }[];
}
export interface FederatedImpact {
  affectedNodes: string[];
  suites: SuiteDecision[];
  warnings: string[];
  mode: 'graph' | 'conservative-full';
}

/** Versioned, reviewed subjects are declarations of local test intent, not measured coverage. */
export function readFederatedSuites(archive: DiscoveryArchive): FederatedSuite[] {
  const text = archive.configuration['impact/evidence/federated-tests.json'];
  if (!text) throw new Error('Missing federated test declarations.');
  const suites = JSON.parse(text) as FederatedSuite[];
  if (!Array.isArray(suites) || new Set(suites.map(item => item.id)).size !== suites.length) throw new Error('Duplicate federated suite ID.');
  for (const item of suites) {
    if (!item.id || !item.file || !item.subjects.length || !['vitest', 'playwright', 'node-test', 'broker-vitest', 'broker-playwright'].includes(item.runner)) throw new Error('Invalid federated suite declaration.');
    if (!item.file.startsWith('external/inventory/') && archive.executionFiles[item.file] === undefined) throw new Error(`Missing federated suite: ${item.file}`);
    for (const subject of item.subjects) if (!subject.startsWith('external/inventory/') && archive.sources[subject] === undefined) throw new Error(`Missing reviewed subject: ${subject}`);
  }
  return [...suites].sort((a, b) => a.id.localeCompare(b.id));
}

function sourcePaths(node: NodeV2): string[] {
  return [...new Set([...node.locations.map(item => item.path), ...(typeof node.attributes.path === 'string' ? [node.attributes.path] : [])])];
}
function diagnosticText(archive: DiscoveryArchive, item: GraphSnapshotV2['diagnostics'][number]): string {
  const locator = item.locator;
  if (!locator) return '';
  if (locator.kind !== 'source') return 'pointer' in locator ? locator.pointer : '';
  const content = archive.sources[locator.path] ?? archive.configuration[locator.path];
  if (!content) return '';
  const lines = content.split('\n');
  const start = lines.slice(0, locator.start.line - 1).reduce((total, line) => total + line.length + 1, 0) + locator.start.column - 1;
  const end = lines.slice(0, locator.end.line - 1).reduce((total, line) => total + line.length + 1, 0) + locator.end.column - 1;
  return content.slice(start, end);
}

/** Evaluate both revisions. Edges always point from consumer to dependency except explicit publication. */
export function calculateFederatedImpact(before: DiscoveryArchive, after: DiscoveryArchive, edits: OverlayEdit[]): FederatedImpact {
  const suites = readFederatedSuites(before);
  const nodes = new Map([...before.graph.nodes, ...after.graph.nodes].map(node => [node.id, node]));
  const edges = new Map([...before.graph.edges, ...after.graph.edges].map(edge => [edge.id, edge]));
  const paths = new Map<string, { edgeId: string; direction: 'forward' | 'reverse' }[]>();
  const changedPaths = new Set(edits.map(edit => edit.path));
  const queue: string[] = [];
  const enqueue = (id: string, path: { edgeId: string; direction: 'forward' | 'reverse' }[]) => {
    if (!nodes.has(id) || paths.has(id)) return;
    paths.set(id, path); queue.push(id);
  };
  // Subscription edits use their changed semantic edges; file-level import propagation would reach sibling queues.
  for (const node of nodes.values()) if (sourcePaths(node).some(path => changedPaths.has(path) && path !== 'packages/messaging/src/topology.json')) enqueue(node.id, []);
  // A removed or added relationship matters even when its source declaration vanished.
  for (const edge of edges.values()) if (!before.graph.edges.some(item => item.id === edge.id) || !after.graph.edges.some(item => item.id === edge.id)) {
    const evidence = [...before.graph.evidence, ...after.graph.evidence].filter(item => edge.evidenceIds.includes(item.id));
    if (evidence.some(item => 'path' in item.locator && changedPaths.has(item.locator.path))) {
      enqueue(edge.from, []);
      if (!['subscribes', 'processes', 'realizes'].includes(edge.type)) enqueue(edge.to, []);
    }
  }
  const warnings: string[] = [];
  const diagnosticKey = (archive: DiscoveryArchive, item: GraphSnapshotV2['diagnostics'][number]) => JSON.stringify([
    item.code, item.message, item.locator && 'path' in item.locator ? item.locator.path : '', diagnosticText(archive, item),
  ]);
  const beforeDiagnostics = new Set(before.graph.diagnostics.map(item => diagnosticKey(before, item)));
  for (const changed of changedPaths) {
    const proven = [...nodes.values()].some(node => sourcePaths(node).includes(changed))
      || [...before.graph.evidence, ...after.graph.evidence].some(item => 'path' in item.locator && item.locator.path === changed && item.resolution === 'resolved');
    if (!proven) warnings.push(`No resolved graph node or evidence for ${changed}.`);
  }
  for (const item of after.graph.diagnostics) if (!beforeDiagnostics.has(diagnosticKey(after, item))
    && ['dynamic-reference', 'parse-failed', 'source-inaccessible', 'missing-contract'].includes(item.code)) warnings.push(item.message);
  const adjacency = new Map<string, { target: string; edge: EdgeV2; direction: 'forward' | 'reverse' }[]>();
  const policies = new Map([...before.graph.policies, ...after.graph.policies].map(policy => [policy.id, policy]));
  const add = (from: string, target: string, edge: EdgeV2, direction: 'forward' | 'reverse') =>
    adjacency.set(from, [...(adjacency.get(from) ?? []), { target, edge, direction }]);
  for (const edge of edges.values()) {
    if (edge.type === 'contains') continue;
    const policy = policies.get(edge.policyRef);
    if (policy?.kind === 'legacy-login-v1' && !('reverseImpact' in policy.configuration && policy.configuration.reverseImpact)) continue;
    add(edge.to, edge.from, edge, 'reverse');
    // Publication changes can change consumers without changing the schema. Endpoint changes expose the provider.
    if (edge.type === 'publishes' || edge.type === 'exposes' || edge.type === 'realizes') add(edge.from, edge.to, edge, 'forward');
  }
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const step of (adjacency.get(id) ?? []).sort((a, b) => a.edge.id.localeCompare(b.edge.id))) {
      enqueue(step.target, [...paths.get(id)!, { edgeId: step.edge.id, direction: step.direction }]);
    }
  }
  const reachedSuite = suites.some(suite => [...nodes.values()].some(node => paths.has(node.id) && sourcePaths(node).some(path => suite.subjects.includes(path))));
  const legacyScoped = [...nodes.values()].some(node => node.legacyId && sourcePaths(node).some(path => changedPaths.has(path)));
  if (edits.length && !reachedSuite && !legacyScoped) warnings.push('Changed source has no reviewed test subject; full available catalogue required.');
  const mode = warnings.length ? 'conservative-full' : 'graph';
  const decisions = suites.map(suite => {
    const matching = [...nodes.values()].filter(node => sourcePaths(node).some(path => suite.subjects.includes(path)) && paths.has(node.id))
      .sort((a, b) => (paths.get(a.id)!.length - paths.get(b.id)!.length) || a.id.localeCompare(b.id));
    const selected = mode === 'conservative-full' || matching.length > 0 || suite.subjects.some(path => changedPaths.has(path));
    const availability = suite.file.startsWith('external/inventory/') && before.executionFiles[suite.file] === undefined ? 'source-inaccessible'
      : suite.runner.startsWith('broker-') ? 'broker-required' : 'available';
    return { id: suite.id, file: suite.file, availability, selected,
      reason: selected ? mode === 'conservative-full' ? warnings.join(' ') : `Reviewed subject ${matching[0]?.id ?? suite.subjects.find(path => changedPaths.has(path))} is affected.` : 'No causal path reaches a reviewed subject.',
      path: matching[0] ? paths.get(matching[0].id)! : [] } satisfies SuiteDecision;
  });
  return { affectedNodes: [...paths.keys()].sort(), suites: decisions, warnings, mode };
}
