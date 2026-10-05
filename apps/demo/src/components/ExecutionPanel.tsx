import type { DemoExecution, ExecutionMode } from '../types';

interface Props {
  selectedCount: number;
  totalCount: number;
  executions: Partial<Record<ExecutionMode, DemoExecution>>;
  busy: boolean;
  disabled: boolean;
  onRun: (mode: ExecutionMode) => void;
  onInspect: (id: string) => void;
}

const duration = (value?: number) => value === undefined ? '—' : value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;

function RunCard({ execution, onInspect }: { execution: DemoExecution; onInspect: (id: string) => void }) {
  const passed = execution.results.filter(result => result.status === 'passed').length;
  const failed = execution.results.filter(result => result.status === 'failed').length;
  return <article className={`run-card ${execution.status}`}>
    <header><div><span>{execution.mode === 'selected' ? 'SELECTED RUN' : 'FULL SUITE'}</span><strong>{execution.status.toUpperCase()}</strong></div><b>{duration(execution.durationMs)}</b></header>
    <div className="run-totals"><span><b>{passed}</b> passed</span><span><b>{failed}</b> failed</span><span><b>{execution.results.length}</b> tests</span></div>
    {execution.error && <pre>{execution.error}</pre>}
    <div className="run-results">{execution.results.map(result => <div className={result.status} key={result.testId}>
      <i /><b>{result.testId}</b><button className="run-inspect" onClick={() => onInspect(result.testId)}>{result.name} · VIEW TEST ↗</button><small>{result.status.toUpperCase()} · {duration(result.durationMs)}</small>
      {result.output && <details><summary>OUTPUT</summary><pre>{result.output}</pre></details>}
    </div>)}</div>
  </article>;
}

export function ExecutionPanel({ selectedCount, totalCount, executions, busy, disabled, onRun, onInspect }: Props) {
  const selected = executions.selected;
  const full = executions.full;
  const selectedBusy = selected?.status === 'queued' || selected?.status === 'running';
  const fullBusy = full?.status === 'queued' || full?.status === 'running';
  const reduction = selected?.durationMs !== undefined && full?.durationMs
    ? (1 - selected.durationMs / full.durationMs) * 100 : undefined;
  return <section className="execution-panel">
    <div className="execution-actions"><div><span>PHYSICAL EXECUTION</span><h2>Run the calculated regression in an isolated source overlay.</h2><p>The server maps trusted catalogue IDs to fixed Vitest and Playwright commands.</p></div><div>
      <button disabled={disabled || busy || selectedCount === 0} onClick={() => onRun('selected')}>{selectedBusy ? 'RUNNING…' : `RUN SELECTED TESTS · ${selectedCount}`}</button>
      <button disabled={disabled || busy} onClick={() => onRun('full')}>{fullBusy ? 'RUNNING…' : `RUN FULL SUITE · ${totalCount}`}</button>
    </div></div>
    {selected && full && <div className="comparison"><div><span>TESTS AVOIDED</span><strong>{totalCount - selectedCount}</strong></div><div><span>SELECTED TIME</span><strong>{duration(selected.durationMs)}</strong></div><div><span>FULL TIME</span><strong>{duration(full.durationMs)}</strong></div><div><span>TIME REDUCTION</span><strong>{reduction === undefined ? '—' : `${reduction.toFixed(1)}%`}</strong></div></div>}
    {(selected || full) && <div className="run-grid">{selected && <RunCard execution={selected} onInspect={onInspect} />}{full && <RunCard execution={full} onInspect={onInspect} />}</div>}
  </section>;
}
