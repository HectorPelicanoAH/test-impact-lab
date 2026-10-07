/** Presentation facts recorded alongside extraction; never part of graph identity or selection. */
export interface ProgressEvent {
  phase: string;
  title: string;
  message: string;
  technique: string;
  status: 'running' | 'completed' | 'failed';
  side: 'before' | 'after';
  nodeIds: string[];
  edgeIds: string[];
  evidenceIds: string[];
  diagnosticIds: string[];
  counts: Record<string, number>;
  paths?: string[];
  warnings?: string[];
  snapshotId?: string;
}
export type ProgressObserver = (event: ProgressEvent) => void;
type Description = Pick<ProgressEvent, 'phase' | 'title' | 'message' | 'technique'> & Partial<ProgressEvent>;

export function progressStep<T>(observer: ProgressObserver | undefined, description: Description, work: () => T,
  detail?: (value: T) => Partial<ProgressEvent>): T {
  const base: ProgressEvent = { side: 'after', nodeIds: [], edgeIds: [], evidenceIds: [], diagnosticIds: [], counts: {}, ...description, status: 'running' };
  observer?.(base);
  try {
    const result = work();
    observer?.({ ...base, ...detail?.(result), status: 'completed' });
    return result;
  } catch (error) {
    observer?.({ ...base, status: 'failed', message: error instanceof Error ? error.message : 'No se pudo completar esta fase.' });
    throw error;
  }
}
