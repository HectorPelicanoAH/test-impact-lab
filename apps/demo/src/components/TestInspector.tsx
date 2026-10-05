import Editor from '@monaco-editor/react';
import type { TestKind, TestMetadata } from '@test-impact/impact-engine';
import type { DemoAnalysis, DemoExecution, DemoSnapshot } from '../types';

const families: { prefix: string; kind: TestKind; label: string; purpose: string }[] = [
  { prefix: 'BU', kind: 'backend-unit', label: 'Backend unit', purpose: 'Domain and use-case behavior in isolation' },
  { prefix: 'FU', kind: 'frontend-unit', label: 'Frontend unit', purpose: 'Client-side functions and API client' },
  { prefix: 'C', kind: 'component', label: 'Component', purpose: 'Rendered UI behavior and interactions' },
  { prefix: 'CT', kind: 'contract', label: 'Contract', purpose: 'HTTP request and response expectations' },
  { prefix: 'I', kind: 'integration', label: 'Integration', purpose: 'Composed login API over HTTP' },
  { prefix: 'E', kind: 'e2e', label: 'End to end', purpose: 'A complete browser login journey' },
];

export function TestLegend() {
  return <section className="test-legend" aria-label="Test ID legend">
    <div><b>READ THE TEST IDs</b><p>The letters name the level being checked; the number identifies one real test. For example, CT2 is the second contract test.</p></div>
    <div className="test-family-grid">{families.map(family => <div key={family.prefix}><strong>{family.prefix}</strong><span>{family.label}</span><small>{family.purpose}</small></div>)}</div>
  </section>;
}

export function TestInspector({ test, snapshot, analysis, execution, onShowChange }: {
  test: TestMetadata;
  snapshot: DemoSnapshot;
  analysis?: DemoAnalysis;
  execution?: DemoExecution;
  onShowChange: (path?: string) => void;
}) {
  const source = snapshot.testFiles.find(file => file.path === test.file);
  const location = snapshot.testLocations[test.id];
  const result = execution?.results.find(item => item.testId === test.id);
  const selected = analysis?.result.selectedTests.includes(test.id);
  const excluded = analysis?.result.excludedTests.find(item => item.testId === test.id);
  const reason = analysis?.result.explanations.find(item => item.testId === test.id);
  const family = families.find(item => item.kind === test.kind);
  const changedPath = analysis?.diff[0]?.path;

  return <section className="test-inspector" aria-label={`Source for ${test.id}`}>
    <div className="test-inspector-heading"><div><span>TEST SOURCE · {family?.label.toUpperCase()}</span><h2><b>{test.id}</b> {test.title.replace(/^\[[^\]]+\]\s*/, '')}</h2><p>{family?.purpose}. The highlighted lines contain this test and its assertions.</p></div>
      <div className="test-inspector-actions">{changedPath && <button onClick={() => onShowChange(changedPath)}>VIEW SOURCE CHANGE ↗</button>}</div>
    </div>
    <div className="test-inspector-evidence">
      <div><b>WHAT IT VALIDATES</b><span>{test.title.replace(/^\[[^\]]+\]\s*/, '')}</span></div>
      <div><b>WHY IT {selected ? 'WAS SELECTED' : analysis ? 'WAS AVOIDED' : 'IS IN THE CATALOGUE'}</b><span>{reason?.reason ?? excluded?.explanation ?? 'Run an impact analysis to see whether this test is needed.'}</span></div>
      <div><b>RUN RESULT</b><span className={result?.status === 'failed' ? 'failure-text' : result?.status === 'passed' ? 'success-text' : ''}>{result ? `${result.status.toUpperCase()}${result.durationMs === undefined ? '' : ` · ${Math.round(result.durationMs)} ms`}` : selected ? 'Not run yet' : analysis ? 'Not run in selected mode' : 'Not run yet'}</span></div>
    </div>
    {result?.output && <details className="test-failure" open={result.status === 'failed'}><summary>RUNNER OUTPUT</summary><pre>{result.output}</pre></details>}
    <div className="test-source-path">{test.file} · lines {location?.startLine ?? '?'}–{location?.endLine ?? '?'}</div>
    <div className="test-source-editor">{source ? <Editor key={test.id} path={test.file} language="typescript" theme="vs-dark" value={source.content}
      onMount={(editor, monaco) => {
        if (!location) return;
        editor.revealLineInCenter(location.startLine);
        editor.createDecorationsCollection([{ range: new monaco.Range(location.startLine, 1, location.endLine, 1), options: { isWholeLine: true, className: 'test-source-highlight' } }]);
      }}
      options={{ readOnly: true, domReadOnly: true, minimap: { enabled: false }, fontSize: 12, lineHeight: 21, automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 10 } }} /> : <p>Source unavailable in this snapshot.</p>}</div>
  </section>;
}
