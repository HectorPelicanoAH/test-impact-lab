import type { GraphEdge, ImpactGraph, TestMetadata } from './schema';

export interface RepositoryKey { productId: string; repositoryId: string }
export interface SourceLocation {
  kind: 'source'; path: string; sourceHash: string;
  start: { line: number; column: number }; end: { line: number; column: number }; symbolId?: string;
}
export type EvidenceLocator = SourceLocation
  | { kind: 'declaration' | 'configuration'; path: string; sourceHash: string; pointer: string; relatedSource?: string }
  | { kind: 'trace'; datasetHash: string; traceRefs: string[] }
  | { kind: 'coverage'; path: string; sourceHash: string; testId: string; revision: string; location: SourceLocation };
export type NodeKind = 'file' | 'symbol' | 'screen' | 'route' | 'service' | 'endpoint' | 'http-contract' | 'event-schema'
  | 'channel' | 'subscription' | 'consumer' | 'broker-resource' | 'test' | 'reviewed-anchor';
export type EdgeKind = 'imports' | 'calls' | 'renders' | 'routes' | 'implements' | 'invokes-endpoint' | 'publishes'
  | 'subscribes' | 'processes' | 'exercises' | 'contains' | 'realizes' | 'injects' | 'exposes';
export interface NodeV2 extends RepositoryKey {
  id: string; kind: NodeKind; label: string; locations: SourceLocation[];
  attributes: Record<string, string | boolean | number>; legacyId?: string;
}
export interface EdgeV2 { id: string; from: string; to: string; type: EdgeKind; qualifiers: Record<string, string | boolean>; evidenceIds: string[]; policyRef: string }
export interface EvidenceV2 {
  id: string; kind: 'static' | 'configuration' | 'reviewed-declaration' | 'measured-coverage' | 'observation';
  extractor: { id: string; version: string; configurationHash: string };
  repository: RepositoryKey; revision: string; locator: EvidenceLocator; reason: string;
  resolution: 'resolved' | 'unresolved' | 'ambiguous' | 'stale';
  supports?: { type: EdgeKind; from: string; to: string };
}
export interface DiagnosticV2 {
  id: string; code: string; message: string; repository: RepositoryKey; locator?: EvidenceLocator;
  candidateIds: string[]; scope: { kind: 'node' | 'repository' | 'catalogue'; ids: string[] };
  selectionAction: 'expand-scope' | 'full-available-catalogue'; evidenceIds: string[];
}
export interface PolicyV2 {
  id: string; version: string; kind: 'legacy-login-v1' | 'conservative-full';
  configuration: GraphEdge['policy'] | { reason: string };
}
export interface ObservationV2 {
  id: string; serviceId: string; serviceVersion: string; environment: string; window: { start: string; end: string };
  traceRefs: string[]; datasetHash: string; correlation: { status: string; nodeIds: string[]; edgeIds: string[]; reason: string };
}
export interface GraphSnapshotV2 {
  schemaVersion: 2; id: string;
  repositories: (RepositoryKey & { revision: string; sourceSetHash: string; availability: 'local' | 'contract-only' | 'inaccessible'; roots: string[]; exclusions: string[] })[];
  inputs: { sourcesHash: string; contractsHash: string; configurationHash: string; catalogueHash: string; extractorsHash: string; policiesHash: string; observationsHash: string | null };
  nodes: NodeV2[]; edges: EdgeV2[]; evidence: EvidenceV2[]; diagnostics: DiagnosticV2[]; policies: PolicyV2[]; observations: ObservationV2[];
}
export interface ChangeSet<T> { added: T[]; removed: T[]; changed: { id: string; before: T; after: T }[] }
export interface SnapshotDeltaV2 {
  beforeSnapshotId: string; afterSnapshotId: string;
  nodes: ChangeSet<NodeV2>; edges: ChangeSet<EdgeV2>; evidence: ChangeSet<EvidenceV2>; diagnostics: ChangeSet<DiagnosticV2>;
}
export type SourceFiles = Record<string, string>;
export type OverlayEdit = { path: string; content: string; operation?: 'add' | 'modify' } | { path: string; operation: 'delete' };
export interface DiscoveryConfig extends RepositoryKey {
  roots: string[]; exclusions: string[]; extensions: string[]; moduleAliases: Record<string, string>;
  routeModules: string[]; maxFiles: number; maxFileBytes: number;
}
/** Hash-addressed archive; source content and execution inputs are not browser-supplied. */
export interface DiscoveryArchive {
  graph: GraphSnapshotV2; sources: SourceFiles; configuration: SourceFiles; executionFiles: SourceFiles;
  config: DiscoveryConfig; catalogue: TestMetadata[]; legacyGraph: ImpactGraph; inventoryRevision?: string;
  externalCatalogue?: { id: string; title: string; path: string; availability: 'local' | 'inaccessible'; execution: 'not-integrated' }[];
}