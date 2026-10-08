import { deferMonacoLayout } from './monaco-layout';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { SnapshotDiffEditor as DiffEditor } from './components/SnapshotDiffEditor';
import type { TestKind } from '@test-impact/impact-engine';
import { RepositoryTree } from './components/RepositoryTree';
import { LiveGraph } from './components/LiveGraph';
import { ExecutionPanel } from './components/ExecutionPanel';
import { TestInspector, TestLegend } from './components/TestInspector';
import { SuiteInspector } from './components/SuiteInspector';
import { applySuggestion, suggestions } from './suggestions';
import { journeyEdits, journeys, type JourneyId } from './journeys';
import type { DemoAnalysis, DemoEditorInput, DemoGraphSession, DemoExecution, DemoExecutionRequest, ExecutionMode } from './types';

type View = 'code' | 'graph' | 'tests';
const viewLabels: Record<View, string> = { code: 'Código', graph: 'Grafos', tests: 'Tests' };
const kindLabels: Record<TestKind, string> = { e2e: 'E2E', component: 'COMPONENT', 'frontend-unit': 'FRONTEND UNIT', contract: 'CONTRACT', integration: 'INTEGRATION', 'backend-unit': 'BACKEND UNIT' };
const languageFor = (path: string) => path.endsWith('.css') ? 'css' : path.endsWith('.json') ? 'json' : 'typescript';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

export function App() {
  const [snapshot, setSnapshot] = useState<DemoEditorInput>();
  const [view, setView] = useState<View>('graph');
  const [selectedPath, setSelectedPath] = useState('');
  const [editorMode, setEditorMode] = useState<'edit' | 'diff'>('edit');
  const [inspectedTestId, setInspectedTestId] = useState<string>();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [newPath, setNewPath] = useState('apps/frontend/src/NewPage.tsx');
  const [analysis, setAnalysis] = useState<DemoAnalysis>();
  const [focusTest, setFocusTest] = useState<string>();
  const [focusEdge, setFocusEdge] = useState<string>();
  const [pending, setPending] = useState(false);
  const [executions, setExecutions] = useState<Partial<Record<ExecutionMode, DemoExecution>>>({});
  const [error, setError] = useState<string>();
  const [journey, setJourney] = useState<JourneyId>('screen');
  const [appliedJourney, setAppliedJourney] = useState<JourneyId>();
  const inspectorRef = useRef<HTMLDivElement>(null);
  const workingRevision = useRef(0);

  useEffect(() => {
    request<DemoEditorInput>('/api/editor-input').then(data => {
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
  const activeExecution = executions.full ?? executions.selected;
  const inspectedSuite = analysis?.federated.suites.find(suite => suite.id === inspectedTestId);
  const inspectedTest = inspectedSuite ? undefined : snapshot?.catalogue.find(test => test.id === inspectedTestId) ?? snapshot?.catalogue[0];

  function updateFile(value: string) {
    if (!snapshot || !selectedPath || deleted.has(selectedPath)) return;
    workingRevision.current++;
    setAppliedJourney(undefined);
    setEdits(current => {
      const next = { ...current };
      if (value === original && snapshot.files.some(file => file.path === selectedPath)) delete next[selectedPath];
      else next[selectedPath] = value;
      return next;
    });
    setAnalysis(undefined);
    setFocusTest(undefined); setFocusEdge(undefined);
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
      setAppliedJourney(undefined);
      setEdits({ [suggestion.path]: changed });
      setDeleted(new Set());
      setSelectedPath(suggestion.path);
      setEditorMode('diff');
      setAnalysis(undefined);
      setFocusTest(undefined); setFocusEdge(undefined);
      setExecutions({});
      setView('code');
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply suggested change.');
    }
  }

  function applyJourney() {
    if (!snapshot) return;
    try {
      const overlay = journeyEdits(journey, Object.fromEntries(snapshot.files.map(file => [file.path, file.content])));
      workingRevision.current++;
      setEdits(Object.fromEntries(overlay.filter(edit => edit.operation !== 'delete').map(edit => [edit.path, edit.content])));
      setDeleted(new Set()); setSelectedPath(overlay[0]!.path); setEditorMode('diff'); setView('code');
      setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({}); setError(undefined); setAppliedJourney(journey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to apply journey.'); }
  }


  const [graphSession, setGraphSession] = useState<DemoGraphSession>();
  const [baseSession, setBaseSession] = useState<DemoGraphSession>();
  const [elapsed, setElapsed] = useState(0);
  const executionBusy = Object.values(executions).some(item => item?.status === 'running' || item?.status === 'queued');
  const headers = { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot?.sessionToken ?? '' };
  useEffect(() => {
    if (!pending && graphSession?.status !== 'running') { setElapsed(0); return; }
    const start = Date.now(), timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, [pending, graphSession?.status]);
  useEffect(() => {
    if (graphSession?.kind === 'impact') {
      void request('/api/graph-sessions/' + graphSession.id, { method: 'DELETE', headers }).catch(() => {});
      setGraphSession(baseSession);
    }
  }, [edits, deleted]);
  async function poll(state: DemoGraphSession, revision: number) {
    let next = state;
    while (next.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (revision !== workingRevision.current) return;
      next = await request<DemoGraphSession>('/api/graph-sessions/' + state.id, { headers });
      if (revision !== workingRevision.current) return;
      setGraphSession(next);
    }
    if (revision !== workingRevision.current) return;
    setGraphSession(next);
    if (next.status === 'completed' && next.kind === 'discovery') setBaseSession(next);
    if (next.analysis) setAnalysis(next.analysis);
    if (next.status === 'error' || next.status === 'stale') setError(next.error ?? 'Las fuentes han cambiado. Recarga y reconstruye.');
  }
  async function advance(state?: DemoGraphSession) {
    if (!snapshot || pending || executionBusy) return;
    const revision = workingRevision.current;
    setPending(true); setError(undefined);
    let current = state ?? graphSession;
    try {
      if (!current) {
        current = await request<DemoGraphSession>('/api/graph-sessions', { method: 'POST', headers, body: JSON.stringify({ kind: 'discovery', inputId: snapshot.id }) });
        if (revision !== workingRevision.current) return;
        setGraphSession(current);
      }
      const next = await request<DemoGraphSession>('/api/graph-sessions/' + current.id + '/next', { method: 'POST', headers,
        body: JSON.stringify({ sequence: current.sequence, key: crypto.randomUUID() }) });
      if (revision !== workingRevision.current) return;
      setGraphSession(next); await poll(next, revision);
    } catch (cause) {
      if (revision !== workingRevision.current) return;
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar la fase.');
      if (current) {
        try { const next = await request<DemoGraphSession>('/api/graph-sessions/' + current.id, { headers }); await poll(next, revision); } catch { /* Reconcile explicitly when connection returns. */ }
      }
    } finally { if (revision === workingRevision.current) setPending(false); }
  }
  async function calculate() {
    if (!snapshot || !baseSession || pending || executionBusy || !modified.size) return;
    const revision = workingRevision.current;
    setPending(true); setError(undefined); setAnalysis(undefined); setExecutions({}); setFocusTest(undefined); setView('graph');
    try {
      if (graphSession?.kind === 'impact') await request('/api/graph-sessions/' + graphSession.id, { method: 'DELETE', headers });
      const overlay = [...Object.entries(edits).filter(([path]) => !deleted.has(path)).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({ path, content,
        ...(snapshot.files.some(file => file.path === path) ? {} : { operation: 'add' as const }) })), ...[...deleted].sort().map(path => ({ path, operation: 'delete' as const }))];
      const next = await request<DemoGraphSession>('/api/graph-sessions', { method: 'POST', headers, body: JSON.stringify({ kind: 'impact', inputId: snapshot.id, baseSessionId: baseSession.id, edits: overlay }) });
      if (revision === workingRevision.current) setGraphSession(next);
    } catch (cause) { if (revision === workingRevision.current) setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el impacto.'); }
    finally { if (revision === workingRevision.current) setPending(false); }
  }
  async function cancelGraph() {
    const current = graphSession;
    workingRevision.current++; setPending(false); setAnalysis(undefined);
    if (current) {
      try { setGraphSession(await request<DemoGraphSession>('/api/graph-sessions/' + current.id, { method: 'DELETE', headers })); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cancelar.'); return false; }
    }
    return true;
  }
  async function resetGraph() {
    if (executionBusy) return;
    if (!await cancelGraph()) return;
    setGraphSession(undefined); setBaseSession(undefined); setExecutions({}); setFocusTest(undefined); setError(undefined);
  }
  async function review(sequence?: number) {
    if (!graphSession || pending) return;
    const revision = workingRevision.current;
    try {
      const next = await request<DemoGraphSession>('/api/graph-sessions/' + graphSession.id + (sequence ? '?sequence=' + sequence : ''), { headers });
      if (revision === workingRevision.current) setGraphSession(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Paso no disponible.'); }
  }
  async function reconcile() {
    if (!graphSession) return;
    const revision = workingRevision.current; setPending(true);
    try { await poll(await request<DemoGraphSession>('/api/graph-sessions/' + graphSession.id, { headers }), revision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado.'); }
    finally { if (revision === workingRevision.current) setPending(false); }
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
    setAppliedJourney(undefined);
    setEdits(current => ({ ...current, [path]: path.endsWith('.tsx') ? 'export function NewPage() {\n  return <main><h1>New page</h1></main>;\n}\n' : path.endsWith('.json') ? '{}\n' : '' }));
    setSelectedPath(path); setEditorMode('edit'); setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({}); setError(undefined);
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
    setAppliedJourney(undefined);
    const component = 'export function GuidedScreen() {\n  return <section aria-label="Guided screen"><h2>Guided screen</h2><p>Overlay-only example. No runtime route is claimed.</p></section>;\n}\n';
    const linked = `${page.includes("from './GuidedScreen'") ? '' : "import { GuidedScreen } from './GuidedScreen';\n"}${page.replace('<h1>Sign in</h1>', '<h1>Sign in</h1><GuidedScreen />')}`;
    setEdits(current => ({ ...current, [path]: component, [pagePath]: linked }));
    setNewPath(path); setSelectedPath(path); setEditorMode('edit'); setView('code');
    setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({}); setError(undefined);
  }

  function deleteSource() {
    if (!snapshot || !selectedPath || deleted.has(selectedPath)) return;
    workingRevision.current++;
    setAppliedJourney(undefined);
    if (snapshot.files.some(file => file.path === selectedPath)) setDeleted(current => new Set([...current, selectedPath]));
    setEdits(current => { const next = { ...current }; delete next[selectedPath]; return next; });
    setSelectedPath(workingFiles.find(file => file.path !== selectedPath)?.path ?? '');
    setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({});
  }

  async function reloadSnapshot() {
    const revision = ++workingRevision.current;
    setAppliedJourney(undefined);
    try {
      const next = await request<DemoEditorInput>('/api/editor-input');
      if (revision !== workingRevision.current) return;
      setSnapshot(next); setGraphSession(undefined); setBaseSession(undefined); setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({});
      setSelectedPath(next.files[0]?.path ?? ''); setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reload snapshot.'); }
  }

  function explain(id: string) {
    setFocusTest(id);
    setFocusEdge(undefined);
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
      const body: DemoExecutionRequest = { snapshotId: analysis.snapshotId, analysisId: analysis.id, mode };
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
      <div className="top-actions"><span className={modified.size ? 'dirty' : ''}>{modified.size} MODIFIED</span><button className="primary" onClick={calculate} disabled={pending || executionBusy || !baseSession || !modified.size}>{pending ? 'En curso…' : 'Analizar impacto'}</button></div>
    </header>

    {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(undefined)}>Dismiss</button></div>}


    {view === 'code' && <div className="scenario-strip">
      <label htmlFor="learning-journey">Escenario</label><select id="learning-journey" value={journey} onChange={event => setJourney(event.target.value as JourneyId)} disabled={pending || executionBusy}>{journeys.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      <button onClick={applyJourney} disabled={pending || executionBusy}>Aplicar cambio</button>
      <details><summary>Cambios rápidos del login</summary>{suggestions.map(item => <button key={item.id} onClick={() => chooseSuggestion(item.id)} disabled={pending || executionBusy}>{item.title}</button>)}</details>
      <button onClick={() => { workingRevision.current++; setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setExecutions({}); }} disabled={pending || executionBusy}>Restaurar código</button>
      <button onClick={reloadSnapshot} disabled={pending || executionBusy}>Recargar fuentes</button>
    </div>}
    <main className="workspace">
      {view === 'code' && <section className="code-view">
        <div className="source-management"><label htmlFor="new-source-path">NEW SOURCE · OVERLAY ONLY</label><input id="new-source-path" value={newPath} onChange={event => setNewPath(event.target.value)} /><button onClick={createSource} disabled={pending || executionBusy}>ADD FILE</button><button onClick={deleteSource} disabled={!selectedPath || pending || executionBusy}>DELETE FILE</button>
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
              options={{ readOnly: true, renderSideBySide: true, originalEditable: false, minimap: { enabled: false }, fontSize: 13, lineHeight: 21, automaticLayout: false, scrollBeyondLastLine: false }} /></div></div>
            : <Editor onMount={editor => deferMonacoLayout(editor)} path={selectedPath} language={languageFor(selectedPath)} theme="vs-dark" value={content} onChange={value => updateFile(value ?? '')}
              options={{ readOnly: !selectedPath || deleted.has(selectedPath), minimap: { enabled: false }, fontSize: 13, lineHeight: 21, fontLigatures: true, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: false, tabSize: 2 }} />}
        </div>
      </section>}
      <section className="graph-view progressive-view" hidden={view !== 'graph'}><LiveGraph session={graphSession} token={snapshot.sessionToken} pending={pending} executionBusy={executionBusy} elapsed={elapsed} focusTest={focusTest}
        onNext={() => { void advance(); }} onReset={() => { void resetGraph(); }} onCancel={() => { void cancelGraph(); }} onReview={sequence => { void review(sequence); }} onTest={inspectTest}
        onReconcile={() => { void reconcile(); }} /></section>

      {view === 'tests' && <section className="tests-view"><div className="tests-heading"><div><span>TEST CATALOGUE</span><h1>Local and distributed regression suites.</h1></div>{analysis && <div><strong>{analysis.result.selectedTests.length + analysis.federated.suites.filter(item => item.selected).length}</strong><span>selected</span></div>}</div>

        <details><summary>Tipos de tests e IDs</summary><TestLegend /></details>
        {analysis && <div className="panel"><div className="panel-title">SUITES DISTRIBUIDAS</div>{analysis.federated.suites.map(suite =>
          <div className="selected-row" key={suite.id}><div><b>{suite.id}</b><span>{suite.selected ? 'Seleccionada' : 'Excluida'} · {suite.availability}</span><small>{suite.reason}</small></div>
          <button onClick={() => inspectTest(suite.id)}>Ver test y resultado</button>{suite.path.length > 0 && <button onClick={() => explain(suite.id)}>Ver camino</button>}</div>)}</div>}
        <ExecutionPanel selectedCount={(analysis?.result.selectedTests.length ?? 0) + (analysis?.federated.suites.filter(item => item.selected).length ?? 0)}
          totalCount={snapshot.catalogue.length + (analysis?.federated.suites.length ?? 0)} executions={executions}
          busy={Object.values(executions).some(execution => execution?.status === 'queued' || execution?.status === 'running')} disabled={!analysis} onRun={runExecution} onInspect={inspectTest} />
        {inspectedTest && <div ref={inspectorRef}><TestInspector test={inspectedTest} snapshot={snapshot} analysis={analysis} execution={activeExecution} onShowChange={showChange} /></div>}
        {inspectedSuite && graphSession && <div ref={inspectorRef}><SuiteInspector suite={inspectedSuite} sessionId={graphSession.id} token={snapshot.sessionToken} execution={activeExecution} onGraph={() => explain(inspectedSuite.id)} /></div>}
        <div className="test-table"><div className="test-table-head"><span>STATUS</span><span>ID / TEST</span><span>TYPE</span><span>EVIDENCE</span></div>{snapshot.catalogue.map(test => {
          const selected = analysis?.result.selectedTests.includes(test.id);
          const excluded = analysis?.result.excludedTests.find(item => item.testId === test.id);
          const runResult = activeExecution?.results.find(result => result.testId === test.id);
          const status = runResult?.status;
          const label = status ? status.toUpperCase() : selected ? 'SELECTED' : analysis ? 'AVOIDED' : 'READY';
          return <div className={`test-row ${selected ? 'selected' : analysis ? 'excluded' : ''} ${status ? `executed-${status}` : ''} ${inspectedTest?.id === test.id ? 'inspected' : ''}`} key={test.id}><span><i />{label}</span><span><button className="test-name-button" onClick={() => inspectTest(test.id)}><b>{test.id}</b>{test.name.replace(/^\[[^\]]+\]\s*/, '')}</button></span><span>{kindLabels[test.kind]}</span><span>{selected ? <><button onClick={() => inspectTest(test.id)}>VIEW CODE</button> <button onClick={() => explain(test.id)}>WHY?</button></> : <>{excluded?.explanation ?? 'Awaiting analysis'} <button onClick={() => inspectTest(test.id)}>VIEW CODE</button></>}</span></div>;
        })}</div></section>}
    </main>

    <footer><span><i /> Fuentes fijadas · Sin IA en runtime</span><span>{graphSession?.status ?? 'Grafo vacío'}</span><span>{graphSession?.step ? 'Paso ' + graphSession.step.sequence + '/' + graphSession.total : '0 nodos · 0 conexiones'}</span></footer>
  </div>;
}
