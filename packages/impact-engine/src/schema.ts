/** Phase 0 design contract. All serialized collections use stable ordering. */
export type TestKind = 'e2e' | 'component' | 'frontend-unit' | 'contract' | 'integration' | 'backend-unit';
export type Side = 'frontend' | 'backend' | 'boundary' | 'shared';
export interface EntityRange { path: string; startLine: number; endLine: number }
export interface GraphNode {
  id: string;
  label: string;
  kind: 'entity' | 'contract' | 'test';
  side: Side;
  layer: string;
  source?: EntityRange;
  testId?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'renders' | 'implements' | 'injects' | 'exercises' | 'exposes';
  evidence: { kind: 'static' | 'runtime' | 'contract' | 'architecture' | 'test-coverage'; source: string; reason: string };
  policy: { reverseImpact: boolean; forwardBoundaryEvidence: boolean; contractExposure: boolean };
}
export interface ImpactGraph { schemaVersion: 1; nodes: GraphNode[]; edges: GraphEdge[] }
export interface TestMetadata {
  id: string;
  name: string;
  kind: TestKind;
  nodeId: string;
  runner: 'vitest' | 'playwright';
  file: string;
  /** Unique full title including stable ID, matched exactly by a server-owned filter. */
  title: string;
}
export interface SnapshotRef { id: string; sourceHash: string; graphHash: string; catalogueHash: string }
export interface FileEdit { path: string; content: string }
export interface AnalysisRequest { snapshotId: string; edits: FileEdit[] }
export interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number }
export interface FileDiff { path: string; status: 'added' | 'modified' | 'deleted'; hunks: DiffHunk[] }
export type TraversalMode = 'implementation' | 'boundary-evidence' | 'journey-only' | 'contract-change';
export interface PathStep { edgeId: string; direction: 'forward' | 'reverse'; mode: TraversalMode }
export interface SelectionReason { testId: string; changedNode: string; path: PathStep[]; reason: string }
export interface BoundaryRecord { contractId: string; origin: string; crossed: boolean; reason: string }
export interface ImpactResult {
  changedEntities: string[];
  affectedNodes: string[];
  journeyNodes: string[];
  selectedTests: string[];
  excludedTests: { testId: string; reason: 'unreachable' | 'boundary-stopped'; boundaryIds: string[]; explanation: string }[];
  boundaries: BoundaryRecord[];
  explanations: SelectionReason[];
  warnings: string[];
  selectionMode: 'graph' | 'conservative-full';
}
export interface AnalysisRecord {
  id: string;
  snapshot: SnapshotRef;
  overlayHash: string;
  diff: FileDiff[];
  result: ImpactResult;
}
export interface RunRequest { analysisId: string; mode: 'selected' | 'full' }
export interface TestResult {
  testId: string;
  kind: TestKind;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';
  durationMs?: number;
  output?: string;
}
export interface RunRecord {
  id: string;
  analysisId: string;
  mode: RunRequest['mode'];
  status: 'queued' | 'running' | 'completed' | 'error' | 'cancelled';
  results: TestResult[];
  wallTimeMs?: number;
  setupTimeMs?: number;
  error?: string;
}
/** Planned pure engine input: mapped diffs and validated graph, never scenario names. */
export interface ImpactInput {
  diff: FileDiff[];
  changedEntityIds: string[];
  graph: ImpactGraph;
  catalogue: TestMetadata[];
  uncertaintyReasons: string[];
}
