import type { FileDiff, ImpactGraph, ImpactResult, SnapshotRef, TestKind, TestMetadata } from '@test-impact/impact-engine';
import type { GraphSnapshotV2, OverlayEdit, SnapshotDeltaV2 } from '../../../packages/impact-engine/src/schema-v2';
import type { FederatedImpact, SuiteDecision } from '../../../packages/impact-engine/src/federated';
import type { ProgressEvent } from '../../../scripts/graph/progress';
export type { LocatedSource } from '../../../scripts/graph/locator';

export interface DemoFile {
  path: string;
  content: string;
  language: 'typescript' | 'json' | 'css';
}

export interface DemoSnapshot extends SnapshotRef {
  sessionToken: string;
  files: DemoFile[];
  testFiles: { path: string; content: string }[];
  testLocations: Record<string, { startLine: number; endLine: number }>;
  graph: ImpactGraph;
  catalogue: TestMetadata[];
  discovery: GraphSnapshotV2;
  editableRoots: string[];
  externalCatalogue: { id: string; title: string; path: string; availability: 'local' | 'inaccessible'; execution: 'not-integrated' }[];
}

export interface DemoAnalysis {
  id: string;
  snapshotId: string;
  diff: FileDiff[];
  result: ImpactResult;
  graph: ImpactGraph;
  beforeGraphId: string;
  afterGraphId: string;
  delta: SnapshotDeltaV2;
  discovery: GraphSnapshotV2;
  federated: FederatedImpact;
}

export interface DemoOperation {
  id: string;
  kind: 'mapping' | 'analysis';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'superseded';
  events: ProgressEvent[];
  snapshotId?: string;
  analysisId?: string;
  error?: string;
}
export interface DemoMapping {
  state: 'empty' | 'building' | 'ready' | 'stale' | 'error';
  revision: number;
  snapshotId?: string;
  operationId?: string;
}

export interface DemoAnalysisRequest {
  snapshotId: string;
  edits: OverlayEdit[];
}

export type ExecutionMode = 'selected' | 'full';
export type ExecutionStatus = 'queued' | 'running' | 'passed' | 'failed' | 'incomplete';
export type TestExecutionStatus = 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'unavailable';

export interface TestExecution {
  testId: string;
  name: string;
  kind: TestKind;
  status: TestExecutionStatus;
  durationMs?: number;
  output?: string;
}

export interface DemoExecution {
  id: string;
  analysisId: string;
  snapshotId: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  results: TestExecution[];
  suiteResults?: (Pick<SuiteDecision, 'id' | 'file' | 'availability'> & { status: TestExecutionStatus; durationMs?: number; output?: string })[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface DemoExecutionRequest {
  snapshotId: string;
  analysisId: string;
  mode: ExecutionMode;
}
