import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type { TestKind } from '@test-impact/impact-engine';
import { RepositoryTree } from './components/RepositoryTree';
import { ImpactSummary, pathLabels } from './components/ImpactSummary';
import { ImpactGraph } from './components/ImpactGraph';
import { ExecutionPanel } from './components/ExecutionPanel';
import { TestInspector, TestLegend } from './components/TestInspector';
import { applySuggestion, suggestions } from './suggestions';
import type { DemoAnalysis, DemoAnalysisRequest, DemoExecution, DemoExecutionRequest, DemoSnapshot, ExecutionMode } from './types';

type View = 'application' | 'code' | 'graph' | 'tests';
const viewLabels: Record<View, string> = { application: 'APPLICATION', code: 'CODE', graph: 'IMPACT GRAPH', tests: 'TESTS' };
const kindLabels: Record<TestKind, string> = { e2e: 'E2E', component: 'COMPONENT', 'frontend-unit': 'FRONTEND UNIT', contract: 'CONTRACT', integration: 'INTEGRATION', 'backend-unit': 'BACKEND UNIT' };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

export function App() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot>();
  const [view, setView] = useState<View>('code');
  const [selectedPath, setSelectedPath] = useState('');
  const [editorMode, setEditorMode] = useState<'edit' | 'diff'>('edit');
  const [inspectedTestId, setInspectedTestId] = useState<string>();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<DemoAnalysis>();
  const [focusTest, setFocusTest] = useState<string>();
  const [pending, setPending] = useState(false);
  const [executions, setExecutions] = useState<Partial<Record<ExecutionMode, DemoExecution>>>({});
  const [error, setError] = useState<string>();
  const inspectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    request<DemoSnapshot>('/api/snapshot').then(data => {
      setSnapshot(data);
      setSelectedPath(data.files.find(file => file.path.endsWith('LoginButton.tsx'))?.path ?? data.files[0]?.path ?? '');
      setInspectedTestId(data.catalogue[0]?.id);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load repository snapshot.'));
  }, []);

  const original = snapshot?.files.find(file => file.path === selectedPath)?.content ?? '';
  const content = edits[selectedPath] ?? original;
  const modified = useMemo(() => new Set(Object.keys(edits)), [edits]);
  const activeExecution = executions.full ?? executions.selected;
  const inspectedTest = snapshot?.catalogue.find(test => test.id === inspectedTestId) ?? snapshot?.catalogue[0];
  const workflow = [
    { label: 'CHANGE', detail: modified.size ? `${modified.size} file${modified.size === 1 ? '' : 's'} modified` : 'Choose or edit source', view: 'code' as View, complete: modified.size > 0 },
    { label: 'CALCULATE', detail: analysis ? `${analysis.result.selectedTests.length} tests selected` : 'Map source impact', view: 'graph' as View, complete: Boolean(analysis) },
    { label: 'INSPECT', detail: analysis ? `${(snapshot?.catalogue.length ?? 0) - analysis.result.selectedTests.length} safely avoided` : 'Review causal paths', view: 'tests' as View, complete: Boolean(analysis) },
    { label: 'EXECUTE', detail: activeExecution ? activeExecution.status.toUpperCase() : 'Run selected or full suite', view: 'tests' as View, complete: activeExecution?.status === 'passed' || activeExecution?.status === 'failed' },
  ];

  function updateFile(value: string) {
    if (!snapshot) return;
    setEdits(current => {
      const next = { ...current };
      if (value === original) delete next[selectedPath];
      else next[selectedPath] = value;
      return next;
    });
    setAnalysis(undefined);
    setFocusTest(undefined);
    setExecutions({});
  }

  function chooseSuggestion(id: string) {
    if (!snapshot) return;
    const suggestion = suggestions.find(item => item.id === id)!;
    const file = snapshot.files.find(item => item.path === suggestion.path)!;
    try {
      const changed = applySuggestion(file.content, suggestion);
      setEdits({ [suggestion.path]: changed });
      setSelectedPath(suggestion.path);
      setEditorMode('diff');
      setAnalysis(undefined);
      setFocusTest(undefined);
      setExecutions({});
      setView('code');
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply suggested change.');
    }
  }

  async function calculate() {
    if (!snapshot) return;
    setPending(true);
    setError(undefined);
    try {
      const body: DemoAnalysisRequest = {
        snapshotId: snapshot.id,
        edits: Object.entries(edits).sort(([a], [b]) => a.localeCompare(b)).map(([path, editedContent]) => ({ path, content: editedContent })),
      };
      const result = await request<DemoAnalysis>('/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify(body) });
      setAnalysis(result);
      setExecutions({});
      setFocusTest(result.result.selectedTests[0]);
      setView('graph');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to calculate regression.');
    } finally {
      setPending(false);
    }
  }

  function explain(id: string) {
    setFocusTest(id);
    setView('graph');
  }

  function showChange(path?: string) {
    if (path) setSelectedPath(path);
    setEditorMode('diff');
    setView('code');
  }

  function inspectTest(id: string) {
    setInspectedTestId(id);
    setView('tests');
    requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function runExecution(mode: ExecutionMode) {
    if (!snapshot || !analysis) return;
    setError(undefined);
    try {
      const body: DemoExecutionRequest = { snapshotId: snapshot.id, analysisId: analysis.id, mode };
      let execution = await request<DemoExecution>('/api/executions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify(body) });
      setExecutions(current => ({ ...current, [mode]: execution }));
      while (execution.status === 'queued' || execution.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 700));
        execution = await request<DemoExecution>(`/api/executions/${execution.id}`, { headers: { 'X-Test-Impact-Session': snapshot.sessionToken } });
        setExecutions(current => ({ ...current, [mode]: execution }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to execute tests.');
    }
  }

  if (!snapshot) return <main className="loading-screen"><div className="logo-mark">TIL</div><p>{error ?? 'Loading immutable repository snapshot…'}</p></main>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="logo-mark">TIL</div><div><b>TEST IMPACT LAB</b><span>deterministic regression explorer</span></div></div>
      <nav>{(Object.keys(viewLabels) as View[]).map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</nav>
      <div className="top-actions"><span className={modified.size ? 'dirty' : ''}>{modified.size} MODIFIED</span><button className="primary" onClick={calculate} disabled={pending}>{pending ? 'CALCULATING…' : 'CALCULATE REGRESSION'}</button></div>
    </header>

    {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(undefined)}>Dismiss</button></div>}

    <div className="suggestion-strip"><div><span>QUICK CHANGES</span>{suggestions.map(item => <button key={item.id} onClick={() => chooseSuggestion(item.id)}><b>{item.title}</b><small>{item.description}</small></button>)}</div>
      <button className="reset" disabled={!modified.size} onClick={() => { setEdits({}); setAnalysis(undefined); setFocusTest(undefined); setExecutions({}); }}>RESET</button>
    </div>

    <section className="workflow-ribbon" aria-label="Regression workflow">
      <div className="workflow-intro"><span>GUIDED FLOW</span><b>From source edit to measured regression</b></div>
      <div className="workflow-steps">{workflow.map((step, index) => <button key={step.label} className={`${step.complete ? 'complete' : ''} ${view === step.view ? 'current' : ''}`} onClick={() => setView(step.view)}>
        <i>{index + 1}</i><span><b>{step.label}</b><small>{step.detail}</small></span>
      </button>)}</div>
      <div className="workflow-proof"><i />DETERMINISTIC · REAL RUNNERS</div>
    </section>

    <main className="workspace">
      {view === 'application' && <section className="application-view">
        <div className="view-intro"><span>LIVE APPLICATION</span><h1>The same login journey represented by the code, graph and tests.</h1><p>Try an invalid password, then sign in with the public demo credentials.</p></div>
        <div className="browser-frame"><div className="browser-chrome"><i /><i /><i /><span>{import.meta.env.VITE_APPLICATION_URL ?? 'http://127.0.0.1:5173'}</span></div><iframe title="Login application" src={import.meta.env.VITE_APPLICATION_URL ?? 'http://127.0.0.1:5173'} /></div>
      </section>}

      {view === 'code' && <section className="code-view">
        <RepositoryTree files={snapshot.files} selected={selectedPath} modified={modified} onSelect={path => { setSelectedPath(path); setEditorMode(modified.has(path) ? 'diff' : 'edit'); }} />
        <div className="editor-panel panel"><div className="editor-header"><span>{selectedPath}</span><div>{modified.has(selectedPath) && <b>MODIFIED</b>}<button className={editorMode === 'edit' ? 'active' : ''} onClick={() => setEditorMode('edit')}>EDIT</button><button className={editorMode === 'diff' ? 'active' : ''} disabled={!modified.has(selectedPath)} onClick={() => setEditorMode('diff')}>COMPARE</button></div></div>
          {editorMode === 'diff' && modified.has(selectedPath) ? <div className="diff-workspace"><div className="diff-explanation"><span className="removed-key">RED · ORIGINAL / REMOVED</span><span className="added-key">GREEN · EDITED / ADDED</span><span>The changed lines are highlighted below. This edited source is what the test runners receive.</span></div><div className="diff-editor"><DiffEditor key={selectedPath} original={original} modified={content} language={selectedPath.endsWith('.json') ? 'json' : 'typescript'} theme="vs-dark"
              onMount={editor => {
                const revealFirstChange = () => {
                  const change = editor.getLineChanges()?.[0];
                  if (change) editor.getModifiedEditor().revealLineInCenter(Math.max(1, change.modifiedStartLineNumber));
                };
                editor.onDidUpdateDiff(revealFirstChange);
                revealFirstChange();
              }}
              options={{ readOnly: true, renderSideBySide: true, originalEditable: false, minimap: { enabled: false }, fontSize: 13, lineHeight: 21, automaticLayout: true, scrollBeyondLastLine: false }} /></div></div>
            : <Editor path={selectedPath} language={selectedPath.endsWith('.json') ? 'json' : 'typescript'} theme="vs-dark" value={content} onChange={value => updateFile(value ?? '')}
              options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 21, fontLigatures: true, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />}
        </div>
        <aside className="impact-panel panel"><div className="panel-title">REGRESSION IMPACT</div><ImpactSummary result={analysis?.result} catalogue={snapshot.catalogue} graph={snapshot.graph} onWhy={explain} /></aside>
      </section>}

      {view === 'graph' && <section className="graph-view"><ImpactGraph snapshot={snapshot} analysis={analysis} focusTest={focusTest} onFocusTest={setFocusTest} />
        <aside className="graph-inspector panel"><div className="panel-title">PATH EXPLANATION</div>{focusTest && analysis ? <>
          <div className="focus-id">{focusTest}</div><h2>{snapshot.catalogue.find(test => test.id === focusTest)?.name.replace(/^\[[^\]]+\]\s*/, '')}</h2>
          <div className="path-list">{pathLabels(focusTest, analysis.result, snapshot.graph).map((label, index, all) => <div key={`${index}:${label}`}><span>{index + 1}</span><b>{label}</b>{index < all.length - 1 && <i>↓</i>}</div>)}</div>
          <p>{analysis.result.explanations.find(reason => reason.testId === focusTest)?.reason}</p>
        </> : <p>Select a test node or calculate regression to inspect its causal path.</p>}
          <details><summary>DETERMINISTIC SELECTION</summary><p>No AI selects tests. The result comes from changed source ranges, versioned graph evidence and architectural boundaries. The same edit and graph produce the same result.</p></details>
        </aside></section>}

      {view === 'tests' && <section className="tests-view"><div className="tests-heading"><div><span>TEST CATALOGUE</span><h1>{snapshot.catalogue.length} real tests, one application.</h1></div>{analysis && <div><strong>{analysis.result.selectedTests.length}</strong><span>selected</span></div>}</div>
        <TestLegend />
        {modified.size > 0 && <div className="changed-files"><b>CHANGED SOURCE</b>{[...modified].sort().map(path => <button key={path} onClick={() => showChange(path)}>{path} <span>VIEW RED / GREEN DIFF ↗</span></button>)}</div>}
        <ExecutionPanel selectedCount={analysis?.result.selectedTests.length ?? 0} totalCount={snapshot.catalogue.length} executions={executions}
          busy={Object.values(executions).some(execution => execution?.status === 'queued' || execution?.status === 'running')} disabled={!analysis} onRun={runExecution} onInspect={inspectTest} />
        {inspectedTest && <div ref={inspectorRef}><TestInspector test={inspectedTest} snapshot={snapshot} analysis={analysis} execution={activeExecution} onShowChange={showChange} /></div>}
        <div className="test-table"><div className="test-table-head"><span>STATUS</span><span>ID / TEST</span><span>TYPE</span><span>EVIDENCE</span></div>{snapshot.catalogue.map(test => {
          const selected = analysis?.result.selectedTests.includes(test.id);
          const excluded = analysis?.result.excludedTests.find(item => item.testId === test.id);
          const runResult = activeExecution?.results.find(result => result.testId === test.id);
          const status = runResult?.status;
          const label = status ? status.toUpperCase() : selected ? 'SELECTED' : analysis ? 'AVOIDED' : 'READY';
          return <div className={`test-row ${selected ? 'selected' : analysis ? 'excluded' : ''} ${status ? `executed-${status}` : ''} ${inspectedTest?.id === test.id ? 'inspected' : ''}`} key={test.id}><span><i />{label}</span><span><button className="test-name-button" onClick={() => inspectTest(test.id)}><b>{test.id}</b>{test.name.replace(/^\[[^\]]+\]\s*/, '')}</button></span><span>{kindLabels[test.kind]}</span><span>{selected ? <><button onClick={() => inspectTest(test.id)}>VIEW CODE</button> <button onClick={() => explain(test.id)}>WHY?</button></> : <>{excluded?.explanation ?? 'Awaiting analysis'} <button onClick={() => inspectTest(test.id)}>VIEW CODE</button></>}</span></div>;
        })}</div></section>}
    </main>

    <footer><span><i /> DETERMINISTIC SELECTION</span><span>SNAPSHOT {snapshot.id}</span><span>{snapshot.graph.nodes.length} NODES · {snapshot.graph.edges.length} EDGES</span><span>NO AI AT RUNTIME</span></footer>
  </div>;
}
