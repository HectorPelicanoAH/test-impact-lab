import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { SnapshotDiffEditor as DiffEditor } from './components/SnapshotDiffEditor';
import type { TestKind } from '@test-impact/impact-engine';
import { RepositoryTree } from './components/RepositoryTree';
import { ImpactSummary } from './components/ImpactSummary';
import { DiscoveryExplorer } from './components/DiscoveryExplorer';
import { ExecutionPanel } from './components/ExecutionPanel';
import { TestInspector, TestLegend } from './components/TestInspector';
import { applySuggestion, suggestions } from './suggestions';
import type { DemoAnalysis, DemoAnalysisRequest, DemoExecution, DemoExecutionRequest, DemoSnapshot, ExecutionMode } from './types';

type View = 'application' | 'code' | 'graph' | 'tests';
const viewLabels: Record<View, string> = { application: 'APPLICATION', code: 'CODE', graph: 'IMPACT GRAPH', tests: 'TESTS' };
const kindLabels: Record<TestKind, string> = { e2e: 'E2E', component: 'COMPONENT', 'frontend-unit': 'FRONTEND UNIT', contract: 'CONTRACT', integration: 'INTEGRATION', 'backend-unit': 'BACKEND UNIT' };
const languageFor = (path: string) => path.endsWith('.css') ? 'css' : path.endsWith('.json') ? 'json' : 'typescript';

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
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [newPath, setNewPath] = useState('apps/frontend/src/NewPage.tsx');
  const [analysis, setAnalysis] = useState<DemoAnalysis>();
  const [focusTest, setFocusTest] = useState<string>();
  const [pending, setPending] = useState(false);
  const [executions, setExecutions] = useState<Partial<Record<ExecutionMode, DemoExecution>>>({});
  const [error, setError] = useState<string>();
  const inspectorRef = useRef<HTMLDivElement>(null);
  const workingRevision = useRef(0);

  useEffect(() => {
    request<DemoSnapshot>('/api/snapshot').then(data => {
      setSnapshot(data);
      setSelectedPath(data.files.find(file => file.path.endsWith('LoginButton.tsx'))?.path ?? data.files[0]?.path ?? '');
      setInspectedTestId(data.catalogue[0]?.id);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load repository snapshot.'));
  }, []);

  const original = snapshot?.files.find(file => file.path === selectedPath)?.content ?? '';
  const content = deleted.has(selectedPath) ? '' : edits[selectedPath] ?? original;
  const modified = useMemo(() => new Set([...Object.keys(edits), ...deleted]), [edits, deleted]);
  const workingFiles = useMemo(() => {
    if (!snapshot) return [];
    const existing = snapshot.files.filter(file => !deleted.has(file.path));
    return [...existing, ...Object.keys(edits).filter(path => !snapshot.files.some(file => file.path === path)).map(path => ({ path, content: edits[path]!, language: 'typescript' as const }))];
  }, [snapshot, edits, deleted]);
  const activeGraph = analysis?.graph ?? snapshot?.graph;
  const activeExecution = executions.full ?? executions.selected;
  const inspectedTest = snapshot?.catalogue.find(test => test.id === inspectedTestId) ?? snapshot?.catalogue[0];
  const workflow = [
    { label: 'CHANGE', detail: modified.size ? `${modified.size} file${modified.size === 1 ? '' : 's'} modified` : 'Choose or edit source', view: 'code' as View, complete: modified.size > 0 },
    { label: 'CALCULATE', detail: analysis ? `${analysis.result.selectedTests.length} tests selected` : 'Map source impact', view: 'graph' as View, complete: Boolean(analysis) },
    { label: 'INSPECT', detail: analysis ? `${(snapshot?.catalogue.length ?? 0) - analysis.result.selectedTests.length} safely avoided` : 'Review causal paths', view: 'tests' as View, complete: Boolean(analysis) },
    { label: 'EXECUTE', detail: activeExecution ? activeExecution.status.toUpperCase() : 'Run selected or full suite', view: 'tests' as View, complete: activeExecution?.status === 'passed' || activeExecution?.status === 'failed' },
  ];

  function updateFile(value: string) {
    if (!snapshot || !selectedPath || deleted.has(selectedPath)) return;
    workingRevision.current++;
    setEdits(current => {
      const next = { ...current };
      if (value === original && snapshot.files.some(file => file.path === selectedPath)) delete next[selectedPath];
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
    try {
      const file = snapshot.files.find(item => item.path === suggestion.path);
      if (!file) throw new Error('Suggested source is absent from this snapshot.');
      const changed = applySuggestion(file.content, suggestion);
      workingRevision.current++;
      setEdits({ [suggestion.path]: changed });
      setDeleted(new Set());
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
    const revision = workingRevision.current;
    setPending(true);
    setError(undefined);
    try {
      const body: DemoAnalysisRequest = {
        snapshotId: snapshot.id,
        edits: [...Object.entries(edits).filter(([path]) => !deleted.has(path)).sort(([a], [b]) => a.localeCompare(b)).map(([path, editedContent]) => ({ path, content: editedContent,
          ...(snapshot.files.some(file => file.path === path) ? {} : { operation: 'add' as const }) })), ...[...deleted].sort().map(path => ({ path, operation: 'delete' as const }))],
      };
      const result = await request<DemoAnalysis>('/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify(body) });
      if (revision !== workingRevision.current) return;
      setAnalysis(result);
      setExecutions({});
      setFocusTest(result.result.selectedTests[0]);
      setView('graph');
    } catch (cause) {
      if (revision === workingRevision.current) setError(cause instanceof Error ? cause.message : 'Unable to calculate regression.');
    } finally {
      setPending(false);
    }
  }

  function createSource() {
    if (!snapshot) return;
    const path = newPath.trim();
    if (!snapshot.editableRoots.some(root => path.startsWith(`${root}/`)) || !/\.(ts|tsx|css|json)$/.test(path)
      || /[\\:%\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part.startsWith('.'))
      || [...snapshot.files.map(file => file.path), ...Object.keys(edits)].some(existing => existing.toLowerCase() === path.toLowerCase())) {
      setError('Choose a new source path inside an editable product root; existing paths cannot be overwritten.');
      return;
    }
    workingRevision.current++;
    setEdits(current => ({ ...current, [path]: path.endsWith('.tsx') ? 'export function NewPage() {\n  return <main><h1>New page</h1></main>;\n}\n' : path.endsWith('.json') ? '{}\n' : '' }));
    setSelectedPath(path); setEditorMode('edit'); setAnalysis(undefined); setFocusTest(undefined); setExecutions({}); setError(undefined);
  }

  function createGuidedScreen() {
    if (!snapshot) return;
    const path = 'apps/frontend/src/GuidedScreen.tsx';
    const pagePath = 'apps/frontend/src/LoginPage.tsx';
    const page = edits[pagePath] ?? snapshot.files.find(file => file.path === pagePath)?.content;
    if (snapshot.files.some(file => file.path === path) || path in edits || deleted.has(pagePath) || !page?.includes('<h1>Sign in</h1>')) {
      setError('The guided screen cannot be added to this working copy; reload or restore the login page first.');
      return;
    }
    workingRevision.current++;
    const component = 'export function GuidedScreen() {\n  return <section aria-label="Guided screen"><h2>Guided screen</h2><p>Overlay-only example. No runtime route is claimed.</p></section>;\n}\n';
    const linked = `${page.includes("from './GuidedScreen'") ? '' : "import { GuidedScreen } from './GuidedScreen';\n"}${page.replace('<h1>Sign in</h1>', '<h1>Sign in</h1><GuidedScreen />')}`;
    setEdits(current => ({ ...current, [path]: component, [pagePath]: linked }));
    setNewPath(path); setSelectedPath(path); setEditorMode('edit'); setView('code');
    setAnalysis(undefined); setFocusTest(undefined); setExecutions({}); setError(undefined);
  }

  function deleteSource() {
    if (!snapshot || !selectedPath || deleted.has(selectedPath)) return;
    workingRevision.current++;
    if (snapshot.files.some(file => file.path === selectedPath)) setDeleted(current => new Set([...current, selectedPath]));
    setEdits(current => { const next = { ...current }; delete next[selectedPath]; return next; });
    setSelectedPath(workingFiles.find(file => file.path !== selectedPath)?.path ?? '');
    setAnalysis(undefined); setFocusTest(undefined); setExecutions({});
  }

  async function reloadSnapshot() {
    const revision = ++workingRevision.current;
    try {
      const next = await request<DemoSnapshot>('/api/snapshot');
      if (revision !== workingRevision.current) return;
      setSnapshot(next); setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setFocusTest(undefined); setExecutions({});
      setSelectedPath(next.files[0]?.path ?? ''); setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reload snapshot.'); }
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
    const revision = workingRevision.current;
    setError(undefined);
    try {
      const body: DemoExecutionRequest = { snapshotId: snapshot.id, analysisId: analysis.id, mode };
      let execution = await request<DemoExecution>('/api/executions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify(body) });
      if (revision !== workingRevision.current) return;
      setExecutions(current => ({ ...current, [mode]: execution }));
      while (execution.status === 'queued' || execution.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 700));
        execution = await request<DemoExecution>(`/api/executions/${execution.id}`, { headers: { 'X-Test-Impact-Session': snapshot.sessionToken } });
        if (revision !== workingRevision.current) return;
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
      <button className="reset" disabled={!modified.size} onClick={() => { workingRevision.current++; setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setFocusTest(undefined); setExecutions({}); setSelectedPath(snapshot.files[0]?.path ?? ''); }}>RESET</button>
      <button className="reset" onClick={reloadSnapshot}>RELOAD SNAPSHOT</button>
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
        <div className="source-management"><label htmlFor="new-source-path">NEW SOURCE · OVERLAY ONLY</label><input id="new-source-path" value={newPath} onChange={event => setNewPath(event.target.value)} /><button onClick={createSource}>ADD FILE</button><button onClick={createGuidedScreen}>CREATE GUIDED SCREEN</button><button onClick={deleteSource} disabled={!selectedPath}>DELETE FILE</button>
          <small>Changes never write to the checkout. Connect a new component with an import/JSX reference, then calculate.</small>
          {deleted.size > 0 && <span role="status">Deleted in overlay: {[...deleted].join(', ')}</span>}</div>
        <RepositoryTree files={workingFiles} selected={selectedPath} modified={modified} onSelect={path => { setSelectedPath(path); setEditorMode(modified.has(path) ? 'diff' : 'edit'); }} />
        <div className="editor-panel panel"><div className="editor-header"><span>{selectedPath}</span><div>{modified.has(selectedPath) && <b>MODIFIED</b>}<button className={editorMode === 'edit' ? 'active' : ''} onClick={() => setEditorMode('edit')}>EDIT</button><button className={editorMode === 'diff' ? 'active' : ''} disabled={!modified.has(selectedPath)} onClick={() => setEditorMode('diff')}>COMPARE</button></div></div>
          {editorMode === 'diff' && modified.has(selectedPath) ? <div className="diff-workspace"><div className="diff-explanation"><span className="removed-key">RED · ORIGINAL / REMOVED</span><span className="added-key">GREEN · EDITED / ADDED</span><span>The changed lines are highlighted below. This edited source is what the test runners receive.</span></div><div className="diff-editor"><DiffEditor key={selectedPath} original={original} modified={content} language={languageFor(selectedPath)} theme="vs-dark"
              onMount={editor => {
                const revealFirstChange = () => {
                  const change = editor.getLineChanges()?.[0];
                  if (change) editor.getModifiedEditor().revealLineInCenter(Math.max(1, change.modifiedStartLineNumber));
                };
                editor.onDidUpdateDiff(revealFirstChange);
                revealFirstChange();
              }}
              options={{ readOnly: true, renderSideBySide: true, originalEditable: false, minimap: { enabled: false }, fontSize: 13, lineHeight: 21, automaticLayout: true, scrollBeyondLastLine: false }} /></div></div>
            : <Editor path={selectedPath} language={languageFor(selectedPath)} theme="vs-dark" value={content} onChange={value => updateFile(value ?? '')}
              options={{ readOnly: !selectedPath || deleted.has(selectedPath), minimap: { enabled: false }, fontSize: 13, lineHeight: 21, fontLigatures: true, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />}
        </div>
        <aside className="impact-panel panel"><div className="panel-title">REGRESSION IMPACT</div><ImpactSummary result={analysis?.result} catalogue={snapshot.catalogue} graph={activeGraph!} onWhy={explain} /></aside>
      </section>}

      {view === 'graph' && <section className="graph-view"><DiscoveryExplorer snapshot={snapshot} analysis={analysis} focusTest={focusTest} onFocusTest={setFocusTest} /></section>}

      {view === 'tests' && <section className="tests-view"><div className="tests-heading"><div><span>TEST CATALOGUE</span><h1>{snapshot.catalogue.length} real tests, one application.</h1></div>{analysis && <div><strong>{analysis.result.selectedTests.length}</strong><span>selected</span></div>}</div>
        <div className="discovery-summary"><h3>EXTERNAL INVENTORY TESTS · {snapshot.externalCatalogue.length || 'SOURCE INACCESSIBLE'}</h3><p>{snapshot.externalCatalogue.length ? 'Registered in the independent Git repository. These tests are NOT part of the available login runner catalogue and are not executed or reported as passed; federation is reserved for G6.' : 'Contract-only inventory: external source/tests unavailable. No external pass or coverage is claimed.'}</p>
          {snapshot.externalCatalogue.map(test => <p key={test.id}>{test.title} · {test.path} · {test.execution}</p>)}</div>
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

    <footer><span><i /> DETERMINISTIC SELECTION</span><span title={snapshot.id}>SNAPSHOT {snapshot.id.slice(0, 16)}</span><span>{activeGraph!.nodes.length} NODES · {activeGraph!.edges.length} EDGES</span><span>NO AI AT RUNTIME</span></footer>
  </div>;
}
