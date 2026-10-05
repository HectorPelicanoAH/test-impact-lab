import type { FileDiff, ImpactGraph, ImpactResult, SnapshotRef, TestMetadata } from '@test-impact/impact-engine';

export interface DemoFile {
  path: string;
  content: string;
  language: 'typescript' | 'json';
}

export interface DemoSnapshot extends SnapshotRef {
  files: DemoFile[];
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
