import { createHash } from 'node:crypto';
import type { DiagnosticV2, DiscoveryConfig, EdgeKind, EdgeV2, EvidenceLocator, EvidenceV2, GraphSnapshotV2, NodeKind, NodeV2, PolicyV2, SnapshotDeltaV2, SourceFiles, SourceLocation } from '../../packages/impact-engine/src/schema-v2';
import { externalTests } from './inventory-http';

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Noncanonical value.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export const fileHashes = (files: SourceFiles) => Object.fromEntries(Object.keys(files).sort().map(path => [path, hash(files[path]!)]));
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
export const nodeId = (config: Pick<DiscoveryConfig, 'productId' | 'repositoryId'>, kind: NodeKind, key: string) =>
  `urn:impact:${encode(config.productId)}:${encode(config.repositoryId)}:${kind}:${encode(key)}`;
export const ordered = <T extends { id: string }>(values: Iterable<T>) => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const distributedRules: Record<EdgeKind, string> = {
  imports: 'Reverse: importers depend on the imported module.', calls: 'Reverse: callers depend on the callee.',
  renders: 'Reverse: rendering views depend on the rendered component.', routes: 'Reverse: route owners depend on their screen.',
  implements: 'Reverse: implementations depend on the contract or schema.',
  'invokes-endpoint': 'Reverse: the HTTP client depends on the qualified endpoint.',
  publishes: 'Reverse for publisher discovery; forward from a changed publisher to its event channel, then reverse through subscribers.',
  subscribes: 'Reverse from a changed channel to each bound subscription. A changed subscription does not reach sibling subscriptions.',
  processes: 'Reverse from a changed subscription to its registered consumer.',
  exercises: 'Reverse: reviewed test subject, not measured coverage.',
  contains: 'Structural grouping only; it does not propagate impact.',
  realizes: 'Reverse from consumer to handler; forward from a changed handler to its consumer.',
  injects: 'Reverse: composition depends on its injected implementation.',
  exposes: 'Reverse from changed provider to endpoint; forward from changed endpoint to provider.',
};

export class GraphBuilder {
  nodes = new Map<string, NodeV2>();
  edges = new Map<string, EdgeV2>();
  evidence = new Map<string, EvidenceV2>();
  diagnostics = new Map<string, DiagnosticV2>();
  policies = new Map<string, PolicyV2>();
  readonly repository;
  readonly revision: string;
  readonly configurationHash: string;
  constructor(readonly files: SourceFiles, readonly config: DiscoveryConfig, readonly configuration: SourceFiles, revision?: string) {
    this.repository = { productId: config.productId, repositoryId: config.repositoryId };
    this.revision = revision ?? `content:${hash(fileHashes(files))}`;
    this.configurationHash = hash({ config, files: fileHashes(configuration) });
    this.policies.set('discovery-conservative-v1', { id: 'discovery-conservative-v1', version: '1', kind: 'conservative-full', configuration: { reason: 'Discovery relationship; use a proven compatibility policy or conservatively expand selection.' } });
  }
  node(kind: NodeKind, key: string, label: string, locations: SourceLocation[] = [], attributes: NodeV2['attributes'] = {}, legacyId?: string) {
    const id = nodeId(this.config, kind, key);
    const value: NodeV2 = { id, kind, label, ...this.repository, locations, attributes, ...(legacyId ? { legacyId } : {}) };
    const existing = this.nodes.get(id);
    if (existing && canonical(existing) !== canonical(value)) throw new Error(`Identity collision: ${id}`);
    this.nodes.set(id, value);
    return id;
  }
  edge(type: EdgeKind, from: string, to: string, locator: EvidenceLocator, reason: string,
    options: { qualifiers?: EdgeV2['qualifiers']; policyRef?: string; kind?: EvidenceV2['kind']; extractor?: string;
      repository?: { productId: string; repositoryId: string }; revision?: string } = {}) {
    const qualifiers = options.qualifiers ?? {};
    const policyRef = options.policyRef ?? `distributed:${type}:v1`;
    if (!this.policies.has(policyRef)) this.policies.set(policyRef, { id: policyRef, version: '1', kind: 'distributed-v1', configuration: { reason: distributedRules[type] } });
    const id = hash([type, from, to, qualifiers]);
    const evidence: EvidenceV2 = {
      id: '', kind: options.kind ?? 'static', extractor: { id: options.extractor ?? 'typescript-discovery', version: '2', configurationHash: this.configurationHash },
      repository: options.repository ?? this.repository, revision: options.revision ?? this.revision, locator, reason, resolution: 'resolved', supports: { type, from, to },
    };
    // Occurrence identity excludes content/revision. A changed locator is a changed evidence record.
    evidence.id = hash([id, evidence.kind, { ...locator, ...('sourceHash' in locator ? { sourceHash: '' } : {}) }, evidence.extractor.id, reason]);
    this.evidence.set(evidence.id, evidence);
    const previous = this.edges.get(id);
    this.edges.set(id, { id, type, from, to, qualifiers, evidenceIds: [...new Set([...(previous?.evidenceIds ?? []), evidence.id])].sort(), policyRef });
    return id;
  }
  diagnostic(code: string, message: string, locator?: EvidenceLocator) {
    const value: DiagnosticV2 = { id: hash([code, message, locator ?? null]), code, message, repository: this.repository,
      ...(locator ? { locator } : {}), candidateIds: [], scope: { kind: 'catalogue', ids: [] }, selectionAction: 'full-available-catalogue', evidenceIds: [] };
    this.diagnostics.set(value.id, value);
  }
}

export function offset(text: string, point: { line: number; column: number }): number {
  const lines = text.split('\n');
  if (!Number.isInteger(point.line) || !Number.isInteger(point.column) || point.line < 1 || point.line > lines.length || point.column < 1 || point.column > lines[point.line - 1]!.length + 1) throw new Error('Invalid evidence range.');
  return lines.slice(0, point.line - 1).reduce((size, line) => size + line.length + 1, 0) + point.column - 1;
}
export function sourceText(locator: EvidenceLocator | undefined, files: SourceFiles): string {
  if (!locator || locator.kind !== 'source' || files[locator.path] === undefined) return '';
  return files[locator.path]!.slice(offset(files[locator.path]!, locator.start), offset(files[locator.path]!, locator.end));
}
export function validateSnapshot(graph: GraphSnapshotV2, sources: SourceFiles, configuration: SourceFiles) {
  const unique = <T extends { id: string }>(items: T[]) => {
    const map = new Map(items.map(item => [item.id, item]));
    if (map.size !== items.length) throw new Error('Duplicate graph identity.');
    return map;
  };
  if (graph.schemaVersion !== 2) throw new Error('Unsupported graph schema.');
  if (graph.inputs.sourcesHash !== hash(fileHashes(sources))) throw new Error('Source manifest hash mismatch.');
  for (const repo of graph.repositories) {
    const repositorySources = Object.fromEntries(Object.entries(sources).filter(([path]) => repo.productId === 'inventory'
      ? path.startsWith('external/inventory/') : !path.startsWith('external/inventory/')));
    if (repo.sourceSetHash !== hash(fileHashes(repositorySources))) throw new Error('Repository source-set hash mismatch.');
  }
  if (graph.inputs.policiesHash !== hash(ordered(graph.policies))) throw new Error('Policy manifest hash mismatch.');
  const config = configuration['impact/discovery.json'];
  if (!config || graph.inputs.configurationHash !== hash({ config: JSON.parse(config), files: fileHashes(configuration) })) throw new Error('Configuration manifest hash mismatch.');
  const catalogue = configuration['impact/catalogue.json'];
  const includesInventory = graph.repositories.some(repo => repo.productId === 'inventory' && repo.repositoryId === 'external-inventory');
  if (!catalogue || graph.inputs.catalogueHash !== (includesInventory ? hash({ local: JSON.parse(catalogue), external: externalTests(sources) }) : hash(JSON.parse(catalogue)))) throw new Error('Catalogue manifest hash mismatch.');
  if (graph.inputs.contractsHash !== hash(fileHashes(Object.fromEntries(Object.entries(sources).filter(([path]) => path.startsWith('packages/api-contract/')))))) throw new Error('Contract manifest hash mismatch.');
  if (!configuration['extractor-manifest.json'] || graph.inputs.extractorsHash !== hash(JSON.parse(configuration['extractor-manifest.json']))) throw new Error('Extractor manifest hash mismatch.');
  if (graph.inputs.observationsHash !== null || graph.observations.length) throw new Error('Observations are not supported in G2.');
  const nodes = unique(graph.nodes), evidence = unique(graph.evidence), policies = unique(graph.policies);
  unique(graph.edges); unique(graph.diagnostics);
  for (const policy of graph.policies) {
    if (!['legacy-login-v1', 'conservative-full', 'distributed-v1'].includes(policy.kind) || policy.version !== '1') throw new Error('Unsupported policy version.');
    if (policy.kind === 'legacy-login-v1' && !['reverseImpact', 'forwardBoundaryEvidence', 'contractExposure'].every(key => typeof (policy.configuration as unknown as Record<string, unknown>)[key] === 'boolean')) throw new Error('Invalid compatibility policy.');
  }
  function location(locator: EvidenceLocator) {
    if (!('path' in locator)) return;
    const content = sources[locator.path] ?? configuration[locator.path];
    if (content === undefined || hash(content) !== locator.sourceHash) throw new Error(`Stale or inaccessible evidence: ${locator.path}`);
    if (locator.kind === 'source' && offset(content, locator.start) > offset(content, locator.end)) throw new Error('Inverted evidence range.');
    if (locator.kind === 'declaration' || locator.kind === 'configuration') {
      let value: unknown = JSON.parse(content);
      for (const key of locator.pointer.split('/').slice(1).map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'))) value = (value as Record<string, unknown>)?.[key];
      if (value === undefined) throw new Error('Unverifiable declaration pointer.');
    }
  }
  for (const node of graph.nodes) {
    if (!graph.repositories.some(repo => repo.productId === node.productId && repo.repositoryId === node.repositoryId)) throw new Error('Unknown node namespace.');
    node.locations.forEach(location);
  }
  for (const item of graph.evidence) {
    if (!graph.repositories.some(repo => repo.productId === item.repository.productId && repo.repositoryId === item.repository.repositoryId && repo.revision === item.revision)) throw new Error('Evidence revision mismatch.');
    location(item.locator);
    if (!item.reason || !item.extractor.version || item.extractor.configurationHash !== graph.inputs.configurationHash) throw new Error('Missing or stale provenance.');
  }
  for (const item of graph.diagnostics) if (item.locator) location(item.locator);
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || !policies.has(edge.policyRef)) throw new Error('Dangling graph reference.');
    if (edge.id !== hash([edge.type, edge.from, edge.to, edge.qualifiers])) throw new Error('Invalid edge identity.');
    if (!edge.evidenceIds.length || !edge.evidenceIds.every(id => {
      const item = evidence.get(id);
      return item?.resolution === 'resolved' && item.supports?.type === edge.type && item.supports.from === edge.from && item.supports.to === edge.to;
    })) throw new Error('Authoritative edge without resolved supporting evidence.');
  }
  const { id, ...body } = graph;
  if (id !== hash(body)) throw new Error('Snapshot hash mismatch.');
}

export function delta(before: GraphSnapshotV2, after: GraphSnapshotV2): SnapshotDeltaV2 {
  function changes<T extends { id: string }>(oldItems: T[], newItems: T[]) {
    const old = new Map(oldItems.map(item => [item.id, item])), next = new Map(newItems.map(item => [item.id, item]));
    return { added: ordered(newItems.filter(item => !old.has(item.id))), removed: ordered(oldItems.filter(item => !next.has(item.id))),
      changed: ordered(newItems.filter(item => old.has(item.id) && canonical(old.get(item.id)) !== canonical(item)).map(item => ({ id: item.id, before: old.get(item.id)!, after: item }))) };
  }
  return { beforeSnapshotId: before.id, afterSnapshotId: after.id, nodes: changes(before.nodes, after.nodes), edges: changes(before.edges, after.edges), evidence: changes(before.evidence, after.evidence), diagnostics: changes(before.diagnostics, after.diagnostics) };
}
