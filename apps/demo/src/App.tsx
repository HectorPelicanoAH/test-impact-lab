import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { SnapshotDiffEditor as DiffEditor } from './components/SnapshotDiffEditor';
import type { TestKind } from '@test-impact/impact-engine';
import { RepositoryTree } from './components/RepositoryTree';
import { ImpactSummary } from './components/ImpactSummary';
import { DiscoveryExplorer } from './components/DiscoveryExplorer';
import { GuidedProcess } from './components/GuidedProcess';
import { ExecutionPanel } from './components/ExecutionPanel';
import { TestInspector, TestLegend } from './components/TestInspector';
import { applySuggestion, suggestions } from './suggestions';
import { journeyEdits, journeys, type JourneyId } from './journeys';
import type { DemoAnalysis, DemoAnalysisRequest, DemoExecution, DemoExecutionRequest, DemoSnapshot, ExecutionMode, DemoOperation, DemoMapping } from './types';

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
  const [pendingKind, setPendingKind] = useState<DemoOperation['kind']>();
  const [executions, setExecutions] = useState<Partial<Record<ExecutionMode, DemoExecution>>>({});
  const [error, setError] = useState<string>();
  const [journey, setJourney] = useState<JourneyId>('consumer');
  const [appliedJourney, setAppliedJourney] = useState<JourneyId>();
  const inspectorRef = useRef<HTMLDivElement>(null);
  const workingRevision = useRef(0);
  const [mapping, setMapping] = useState<DemoMapping>({ state: 'empty', revision: 0 });
  const [mappingOperation, setMappingOperation] = useState<DemoOperation>();
  const [analysisOperation, setAnalysisOperation] = useState<DemoOperation>();
  const [technical, setTechnical] = useState(false);

  useEffect(() => {
    request<DemoSnapshot>('/api/snapshot').then(async data => {
      setSnapshot(data);
      setSelectedPath(data.files.find(file => file.path.endsWith('LoginButton.tsx'))?.path ?? data.files[0]?.path ?? '');
      setInspectedTestId(data.catalogue[0]?.id);
      const status = await request<DemoMapping>('/api/mapping', { headers: { 'X-Test-Impact-Session': data.sessionToken } });
      setMapping(status);
      if (status.operationId) setMappingOperation(await request<DemoOperation>(`/api/operations/${status.operationId}`, { headers: { 'X-Test-Impact-Session': data.sessionToken } }));
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load repository snapshot.'));
  }, []);
  useEffect(() => { setAnalysisOperation(undefined); }, [edits, deleted]);

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
  const executionBusy = Object.values(executions).some(item => item?.status === 'queued' || item?.status === 'running');
  const inspectedTest = snapshot?.catalogue.find(test => test.id === inspectedTestId) ?? snapshot?.catalogue[0];
  const workflow = [
    { label: 'CONSTRUIR MAPEO', detail: mapping.state === 'ready' ? 'Fuentes y evidencias listas' : 'Descubrir relaciones', view: 'graph' as View, complete: mapping.state === 'ready' },
    { label: 'APLICAR CAMBIO', detail: modified.size ? `${modified.size} archivos modificados` : 'Elegir un journey', view: 'code' as View, complete: modified.size > 0 },
    { label: 'CALCULAR IMPACTO', detail: analysis ? `${analysis.result.selectedTests.length} tests locales seleccionados` : 'Explicar la selección', view: 'graph' as View, complete: Boolean(analysis) },
    { label: 'REVISAR Y EJECUTAR', detail: activeExecution ? activeExecution.status.toUpperCase() : 'Lanzar runners reales', view: 'tests' as View, complete: activeExecution?.status === 'passed' || activeExecution?.status === 'failed' },
  ];

  async function followOperation(initial: DemoOperation, revision: number, update: (value: DemoOperation) => void) {
    let current = initial;
    while (revision === workingRevision.current) {
      update(current);
      if (!['queued', 'running'].includes(current.status)) {
        if (current.status !== 'completed') throw new Error(current.error ?? 'La operación ha sido invalidada.');
        return current;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      current = await request<DemoOperation>(`/api/operations/${current.id}`, { headers: { 'X-Test-Impact-Session': snapshot!.sessionToken } });
    }
    return undefined;
  }

  async function buildMapping() {
    if (!snapshot || executionBusy) return;
    const revision = ++workingRevision.current;
    setPending(true); setPendingKind('mapping'); setMappingOperation(undefined); setError(undefined); setAnalysis(undefined); setAnalysisOperation(undefined); setExecutions({}); setFocusEdge(undefined); setFocusTest(undefined); setTechnical(false); setView('graph');
    setMapping(current => ({ ...current, state: 'building' }));
    try {
      const base = await request<DemoSnapshot>('/api/snapshot').catch(() => snapshot);
      if (revision !== workingRevision.current) return;
      const initial = await request<DemoOperation>('/api/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify({ snapshotId: base.id }) });
      const completed = await followOperation(initial, revision, setMappingOperation);
      if (!completed || revision !== workingRevision.current) return;
      const next = await request<DemoSnapshot>('/api/snapshot');
      const status = await request<DemoMapping>('/api/mapping', { headers: { 'X-Test-Impact-Session': snapshot.sessionToken } });
      if (revision !== workingRevision.current) return;
      setSnapshot(next); setMapping(status);
    } catch (cause) { if (revision === workingRevision.current) { setMapping(current => ({ ...current, state: 'error' })); setError(cause instanceof Error ? cause.message : 'No se pudo construir el mapeo.'); } }
    finally { setPending(false); }
  }

  async function clearMapping() {
    if (!snapshot || executionBusy) return;
    const revision = ++workingRevision.current;
    setPending(true); setError(undefined);
    try {
      const status = await request<DemoMapping>('/api/mapping', { method: 'DELETE', headers: { 'X-Test-Impact-Session': snapshot.sessionToken } });
      if (revision !== workingRevision.current) return;
      setMapping(status); setMappingOperation(undefined); setAnalysisOperation(undefined); setAnalysis(undefined); setExecutions({}); setFocusEdge(undefined); setFocusTest(undefined); setTechnical(false); setView('graph');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo borrar el mapeo.'); }
    finally { setPending(false); }
  }

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

  async function calculate() {
    if (!snapshot || mapping.state !== 'ready' || pending) return;
    const revision = workingRevision.current;
    setPending(true);
    setPendingKind('analysis'); setAnalysisOperation(undefined);
    setError(undefined);
    setAnalysis(undefined); setExecutions({}); setTechnical(false); setView('graph');
    try {
      const body: DemoAnalysisRequest = {
        snapshotId: snapshot.id,
        edits: [...Object.entries(edits).filter(([path]) => !deleted.has(path)).sort(([a], [b]) => a.localeCompare(b)).map(([path, editedContent]) => ({ path, content: editedContent,
          ...(snapshot.files.some(file => file.path === path) ? {} : { operation: 'add' as const }) })), ...[...deleted].sort().map(path => ({ path, operation: 'delete' as const }))],
      };
      const initial = await request<DemoOperation>('/api/analysis-operations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Impact-Session': snapshot.sessionToken }, body: JSON.stringify(body) });
      const completed = await followOperation(initial, revision, setAnalysisOperation);
      if (!completed || revision !== workingRevision.current) return;
      const result = await request<DemoAnalysis>(`/api/analyses/${completed.analysisId}`, { headers: { 'X-Test-Impact-Session': snapshot.sessionToken } });
      if (revision !== workingRevision.current) return;
      setAnalysis(result);
      setExecutions({});
      setFocusTest(undefined);
      setFocusEdge(undefined);
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
      const next = await request<DemoSnapshot>('/api/snapshot');
      const status = await request<DemoMapping>('/api/mapping', { headers: { 'X-Test-Impact-Session': next.sessionToken } });
      if (revision !== workingRevision.current) return;
      setSnapshot(next); setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({});
      setMapping(status); setAnalysisOperation(undefined);
      setMappingOperation(status.operationId ? await request<DemoOperation>(`/api/operations/${status.operationId}`, { headers: { 'X-Test-Impact-Session': next.sessionToken } }) : undefined);
      setSelectedPath(next.files[0]?.path ?? ''); setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reload snapshot.'); }
  }

  function explain(id: string) {
    setTechnical(false);
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

  return <div className="app-shell guided-shell">
    <header className="topbar">
      <div className="brand"><div className="logo-mark">TIL</div><div><b>TEST IMPACT LAB</b><span>deterministic regression explorer</span></div></div>
      <nav>{(Object.keys(viewLabels) as View[]).map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</nav>
      <div className="top-actions"><span className={modified.size ? 'dirty' : ''}>{modified.size} MODIFIED</span><button className="primary" onClick={calculate} disabled={pending || mapping.state !== 'ready' || !modified.size}>{pending ? 'CALCULATING…' : 'CALCULATE REGRESSION'}</button></div>
    </header>

    {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(undefined)}>Dismiss</button></div>}

    <div className="suggestion-strip"><div><span>QUICK CHANGES</span>{suggestions.map(item => <button key={item.id} onClick={() => chooseSuggestion(item.id)}><b>{item.title}</b><small>{item.description}</small></button>)}</div>
      <button className="reset" disabled={!modified.size} onClick={() => { workingRevision.current++; setAppliedJourney(undefined); setEdits({}); setDeleted(new Set()); setAnalysis(undefined); setFocusTest(undefined); setFocusEdge(undefined); setExecutions({}); setSelectedPath(snapshot.files[0]?.path ?? ''); }}>RESET</button>
      <button className="reset" onClick={reloadSnapshot}>RELOAD SNAPSHOT</button>
    </div>

    <section className="workflow-ribbon" aria-label="Regression workflow">
      <div className="workflow-intro"><span>RECORRIDO GUIADO</span><b>Descubrimiento → impacto → ejecución</b></div>
      <div className="workflow-steps">{workflow.map((step, index) => <button key={step.label} className={`${step.complete ? 'complete' : ''} ${view === step.view ? 'current' : ''}`} onClick={() => setView(step.view)}>
        <i>{index + 1}</i><span><b>{step.label}</b><small>{step.detail}</small></span>
      </button>)}</div>
      <div className="workflow-proof"><i />DETERMINISTIC · REAL RUNNERS</div>
    </section>

    <section className="learning-journeys panel" aria-label="Learning journeys">
      <div className="journey-choice"><label htmlFor="learning-journey">LEARNING JOURNEY</label><select id="learning-journey" value={journey} disabled={pending} onChange={event => { setJourney(event.target.value as JourneyId); setFocusEdge(undefined); setFocusTest(undefined); }}>{journeys.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button onClick={applyJourney} disabled={pending}>APPLY JOURNEY</button><small>Aplica código a una copia de trabajo desde el snapshot base.</small></div>
      <p>{{ consumer: 'Añade un handler y su suscripción. Descubre el código, la cola y sus relaciones sin desplegar un servicio ni crear cobertura.', http: 'El cliente declara v2 y el proveedor sigue en v1. Inspecciona el binding retirado y el fallo contractual.', screen: 'Añade un componente y su import/JSX. Descubre cómo el compilador resuelve sus relaciones.', event: 'Cambia la versión del evento. Explica el contrato incompatible y las relaciones retiradas.', retry: 'Introduce un fallo y reduce reintentos. Observa configuración, impacto y resultados reales.', unresolved: 'Sustituye un destino literal por una expresión. Explica el diagnóstico y la selección conservadora.' }[appliedJourney ?? journey]}</p>
      {appliedJourney && <div className="journey-progress" aria-label="Journey evidence">
        <span>Applied: {journeys.find(item => item.id === appliedJourney)!.title}</span>
        {[...modified].map(path => <button key={path} onClick={() => showChange(path)}>{path} · SOURCE DIFF</button>)}
        <button onClick={() => setView('graph')} disabled={!analysis}>DELTA · {analysis ? `${analysis.delta.edges.added.length} added / ${analysis.delta.edges.removed.length} removed edges` : 'calculate first'}</button>
        <button disabled={!analysis} onClick={() => {
          const edge = analysis?.delta.edges.added.find(item => item.type !== 'contains') ?? analysis?.delta.edges.removed.find(item => item.type !== 'contains')
            ?? analysis?.discovery.edges.find(item => item.evidenceIds.some(id => analysis.discovery.evidence.some(proof => proof.id === id && 'path' in proof.locator && modified.has(proof.locator.path))));
          setFocusTest(undefined); setFocusEdge(undefined); setFocusEdge(edge?.id); setView('graph');
        }}>INSPECT JOURNEY EVIDENCE</button>
        <button onClick={() => setView('tests')} disabled={!analysis}>IMPACT → EXECUTION{analysis ? ` · ${analysis.federated.mode}` : ''}</button>
        <span role="status">{activeExecution ? `Execution: ${activeExecution.status}${activeExecution.suiteResults?.some(item => item.status === 'unavailable') ? ' · unavailable suites are not passes' : ''}` : 'Execution: not run'}</span>
      </div>}
      <details><summary>What the sources prove · refresh and visibility</summary><p>Compiler facts resolve supported imports, calls and JSX. HTTP and RabbitMQ adapters bind explicit contracts and registrations. Reviewed test subjects declare intent; they do not measure coverage. OpenTelemetry and mesh record observed traffic for their own revision and time window; absent traffic cannot remove a dependency.</p><p>Calculate analyzes the actual edited bytes against the pinned snapshot. Reload snapshot reads the current checkout and resets the overlay. Filesystem watching rebuilds the full index after a change; unchanged fingerprints skip extraction. Dynamic references, inaccessible repositories and unsupported patterns remain diagnostics and require conservative selection. Only registered, available suites can execute; failed, skipped and unavailable results remain visible.</p></details>
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
        <aside className="impact-panel panel"><div className="panel-title">REGRESSION IMPACT</div><ImpactSummary result={analysis?.result} federated={analysis?.federated} catalogue={snapshot.catalogue} graph={activeGraph!} onWhy={explain} /></aside>
      </section>}

      {view === 'graph' && (technical ? <section className="graph-view"><button className="back-to-guided" onClick={() => setTechnical(false)}>← Volver al recorrido guiado</button><DiscoveryExplorer snapshot={snapshot} analysis={analysis} focusTest={focusTest} focusEdge={focusEdge} onFocusTest={setFocusTest} /></section> : <GuidedProcess snapshot={snapshot} analysis={analysis} operation={pending && pendingKind === 'analysis' ? analysisOperation : analysisOperation ?? mappingOperation} mapping={mapping} journey={appliedJourney ?? journey} pending={pending} pendingKind={pendingKind} executionBusy={executionBusy} hasChanges={modified.size > 0} focusEdge={focusEdge} focusTest={focusTest}
        onBuild={buildMapping} onClear={clearMapping} onCalculate={calculate} onTests={() => setView('tests')} onAdvanced={() => setTechnical(true)} />)}

      {view === 'tests' && <section className="tests-view"><div className="tests-heading"><div><span>TEST CATALOGUE</span><h1>Local and distributed regression suites.</h1></div>{analysis && <div><strong>{analysis.result.selectedTests.length + analysis.federated.suites.filter(item => item.selected).length}</strong><span>selected</span></div>}</div>
        <div className="discovery-summary"><h3>EXTERNAL INVENTORY TESTS · {snapshot.externalCatalogue.length || 'SOURCE INACCESSIBLE'}</h3><p>{snapshot.externalCatalogue.length ? 'Registered in the independent Git repository. G6 selects its reviewed suite and executes the pinned source when available.' : 'Contract-only inventory: external source/tests unavailable. No external pass or coverage is claimed.'}</p>
          {snapshot.externalCatalogue.map(test => <p key={test.id}>{test.title} · {test.path} · G6 suite: inventory-provider</p>)}</div>
        <TestLegend />
        {modified.size > 0 && <div className="changed-files"><b>CHANGED SOURCE</b>{[...modified].sort().map(path => <button key={path} onClick={() => showChange(path)}>{path} <span>VIEW RED / GREEN DIFF ↗</span></button>)}</div>}
        {analysis && <div className="panel"><div className="panel-title">DISTRIBUTED IMPACT · {analysis.federated.mode.toUpperCase()}</div>
          {analysis.federated.warnings.map(warning => <p key={warning}>{warning}</p>)}
          {analysis.federated.suites.map(suite => <div className="selected-row" key={suite.id}><div><b>{suite.id}</b><span>{suite.selected ? 'Affected' : 'Excluded'} · {suite.availability}</span><small>{suite.reason}</small>
            <small>{suite.path.map(step => {
              const edge = analysis.discovery.edges.find(item => item.id === step.edgeId) ?? snapshot.discovery.edges.find(item => item.id === step.edgeId);
              return `${step.direction} ${edge?.type ?? 'historical edge'}`;
            }).join(' → ')}</small></div>{suite.path.length > 0 && <button onClick={() => { setFocusEdge(suite.path.at(-1)!.edgeId); setView('graph'); }}>INSPECT EVIDENCE</button>}</div>)}
        </div>}
        <ExecutionPanel selectedCount={(analysis?.result.selectedTests.length ?? 0) + (analysis?.federated.suites.filter(item => item.selected).length ?? 0)}
          totalCount={snapshot.catalogue.length + (analysis?.federated.suites.length ?? 0)} executions={executions}
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
