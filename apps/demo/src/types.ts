import type { FileDiff, ImpactGraph, ImpactResult, SnapshotRef, TestKind, TestMetadata } from '@test-impact/impact-engine';
import type { GraphSnapshotV2, OverlayEdit, SnapshotDeltaV2 } from '../../../packages/impact-engine/src/schema-v2';
import type { FederatedImpact, FederatedSuite, SuiteDecision } from '../../../packages/impact-engine/src/federated';
import type { DiscoveryPhase } from '../../../scripts/graph/snapshot';
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
  suites: DemoSuite[];
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

export interface DemoAnalysisRequest {
  snapshotId: string;
  edits: OverlayEdit[];
}

export type DemoSuite = FederatedSuite & { source: string | null; availability: SuiteDecision['availability'] };
export type DemoEditorInput = Pick<DemoSnapshot, 'sessionToken' | 'files' | 'testFiles' | 'testLocations' | 'catalogue' | 'editableRoots' | 'externalCatalogue' | 'suites'> & { id: string };
export interface GraphStepResult extends DiscoveryPhase {
  sequence: number; durationMs: number; result: string;
  newNodeIds: string[]; newEdgeIds: string[]; updatedNodeIds: string[]; updatedEdgeIds: string[];
  removedNodeIds: string[]; removedEdgeIds: string[]; confirmedNodeIds: string[]; confirmedEdgeIds: string[];
}
export interface DemoGraphSession {
  id: string; kind: 'discovery' | 'impact'; inputId: string;
  status: 'waiting' | 'running' | 'completed' | 'error' | 'cancelled' | 'stale';
  sequence: number; total: number; nextPhase?: DiscoveryPhase; step?: GraphStepResult; steps: GraphStepResult[];
  graph: GraphSnapshotV2; beforeGraph?: GraphSnapshotV2; layoutLayers: Record<string, string>; changedPaths: string[]; localImpact?: ImpactResult; snapshotId?: string; analysis?: DemoAnalysis; error?: string;
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
