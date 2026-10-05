import type { FileDiff, ImpactGraph, ImpactResult, SnapshotRef, TestKind, TestMetadata } from '@test-impact/impact-engine';

export interface DemoFile {
  path: string;
  content: string;
  language: 'typescript' | 'json';
}

export interface DemoSnapshot extends SnapshotRef {
  sessionToken: string;
  files: DemoFile[];
  testFiles: { path: string; content: string }[];
  testLocations: Record<string, { startLine: number; endLine: number }>;
  graph: ImpactGraph;
  catalogue: TestMetadata[];
}

export interface DemoAnalysis {
  id: string;
  snapshotId: string;
  diff: FileDiff[];
  result: ImpactResult;
}

export interface DemoAnalysisRequest {
  snapshotId: string;
  edits: { path: string; content: string }[];
}

export type ExecutionMode = 'selected' | 'full';
export type ExecutionStatus = 'queued' | 'running' | 'passed' | 'failed';
export type TestExecutionStatus = 'queued' | 'running' | 'passed' | 'failed' | 'skipped';

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
