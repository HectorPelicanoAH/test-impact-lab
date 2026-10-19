import { deferMonacoLayout } from '../monaco-layout';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Background, Controls, getViewportForBounds, MarkerType, MiniMap, Position, ReactFlow, type Node, type Edge, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NodeV2 } from '../../../../packages/impact-engine/src/schema-v2';
import type { DemoGraphSession, LocatedSource } from '../types';

const layers = ['e2e', 'component', 'frontend-unit', 'UI', 'UI composition', 'UI behavior', 'UI validation', 'Frontend application', 'Frontend validation', 'API client', 'API contract', 'Primary adapter', 'HTTP transport', 'HTTP transport behavior', 'Application', 'Application behavior', 'Domain', 'Domain behavior', 'Domain invariant', 'Domain identity', 'Port', 'Secondary adapter', 'integration', 'backend-unit', 'Archivos', 'Símbolos', 'Pantallas', 'HTTP', 'Contratos', 'Canales', 'Colas', 'Consumidores', 'Recursos', 'Tests'];
const kinds: Record<NodeV2['kind'], string> = { file: 'Archivos', symbol: 'Símbolos', screen: 'Pantallas', route: 'Pantallas', service: 'HTTP', endpoint: 'HTTP', 'http-contract': 'Contratos', 'event-schema': 'Contratos', channel: 'Canales', subscription: 'Colas', consumer: 'Consumidores', 'broker-resource': 'Recursos', test: 'Tests', 'reviewed-anchor': 'Símbolos' };
const relations: Record<string, string> = { imports: 'importa', calls: 'llama', renders: 'renderiza', routes: 'enruta', implements: 'implementa', 'invokes-endpoint': 'invoca endpoint', publishes: 'publica', subscribes: 'se suscribe', processes: 'procesa', exercises: 'valida sujeto', contains: 'contiene', realizes: 'registra / realiza', injects: 'inyecta', exposes: 'expone' };
interface Props {
  session?: DemoGraphSession; token: string; pending: boolean; executionBusy: boolean; elapsed: number;
  automatic: boolean; quickDisabled: boolean; quickLabel: string; onRunAll: () => void;
  focusTest?: string; onNext: () => void; onReset: () => void; onCancel: () => void;
  onReview: (sequence?: number) => void; onTest: (id: string) => void; onReconcile: () => void;
}

export function LiveGraph({ session, token, pending, executionBusy, elapsed, focusTest, onNext, onReset, onCancel, onReview, onTest, onReconcile, automatic, quickDisabled, quickLabel, onRunAll }: Props) {
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string }>();
  const [source, setSource] = useState<LocatedSource>();
  const [sourceError, setSourceError] = useState<string>();
  const [structural, setStructural] = useState(true);
  const [framing, setFraming] = useState('login');
  const sourceVersion = useRef(0), flow = useRef<ReactFlowInstance<Node, Edge>>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const processLog = useRef<HTMLDivElement>(null);
  const placements = useRef(new Map<string, { x: number; y: number }>()), rows = useRef(new Map<string, number>()), firstFit = useRef(false), discoveryId = useRef<string | undefined>(undefined);
  const step = session?.step, busy = pending || session?.status === 'running';
  useEffect(() => {
    const log = processLog.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [session?.id, session?.steps.length, busy]);
  const shown = useMemo(() => {
    const before = session?.beforeGraph, graph = session?.graph;
    const nodes = [...new Map([...(before?.nodes ?? []), ...(graph?.nodes ?? [])].map(node => [node.id, node])).values()];
    const edges = [...new Map([...(before?.edges ?? []), ...(graph?.edges ?? [])].map(edge => [edge.id, edge])).values()];
    const evidence = [...new Map([...(before?.evidence ?? []), ...(graph?.evidence ?? [])].map(proof => [proof.id, proof])).values()];
    return { nodes, edges, evidence };
  }, [session]);
  if (session?.kind === 'discovery' && discoveryId.current !== session.id) {
    discoveryId.current = session.id; placements.current.clear(); rows.current.clear(); firstFit.current = false;
  }
  const nodeMap = new Map(shown.nodes.map(node => [node.id, node]));
  const selectedNode = selection?.kind === 'node' ? nodeMap.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? shown.edges.find(edge => edge.id === selection.id) : undefined;
  const nodeEdges = selectedNode ? shown.edges.filter(edge => edge.from === selectedNode.id || edge.to === selectedNode.id) : [];
  const proofs = selectedEdge ? shown.evidence.filter(proof => selectedEdge.evidenceIds.includes(proof.id)) : [];
  const impactResult = session?.analysis?.result ?? session?.localImpact;
  const localPath = impactResult?.explanations.find(item => item.testId === focusTest)?.path ?? [];
  const suitePath = session?.analysis?.federated.suites.find(item => item.id === focusTest)?.path ?? [];
  const pathIds = new Set([...suitePath.map(item => item.edgeId), ...shown.edges.filter(edge => localPath.some(item => item.edgeId === edge.qualifiers.legacyId)).map(edge => edge.id)]);
  const state = (id: string, type: 'node' | 'edge') => {
    if ((type === 'node' ? step?.removedNodeIds : step?.removedEdgeIds)?.includes(id)) return 'retired';
    if ((type === 'node' ? step?.newNodeIds : step?.newEdgeIds)?.includes(id)) return 'fresh';
    if ((type === 'node' ? step?.updatedNodeIds : step?.updatedEdgeIds)?.includes(id)) return 'updated';
    if (session?.kind === 'impact' && session.status !== 'completed' && !(type === 'node' ? step?.confirmedNodeIds : step?.confirmedEdgeIds)?.includes(id)
      && !(type === 'node' ? session.graph.nodes : session.graph.edges).some(item => item.id === id)) return 'unverified';
    return 'known';
  };
  const changed = new Set(impactResult?.changedEntities ?? []), affected = new Set(impactResult?.affectedNodes ?? []);
  const selectedTests = new Set(session?.analysis?.result.selectedTests ?? []);
  const visibleNodes = shown.nodes.filter(node => structural || node.kind !== 'file');
  const ids = new Set(visibleNodes.map(node => node.id));
  const nodes: Node[] = visibleNodes.map(node => {
    const path = node.locations[0]?.path ?? String(node.attributes.path ?? '');
    const root = session?.graph.repositories.flatMap(repo => repo.roots).find(root => path.startsWith(root + '/'));
    const codeNode = node.kind === 'file' || node.kind === 'symbol';
    const layer = typeof node.attributes.layer === 'string' ? node.attributes.layer : codeNode ? session?.layoutLayers?.[path] ?? root ?? 'Código externo' : kinds[node.kind];
    let position = placements.current.get(node.id);
    if (!position) {
      const bucket = `${codeNode ? 'code:' : 'architecture:'}${layer}`;
      const row = rows.current.get(bucket) ?? 0, known = layers.indexOf(layer);
      const roots = session?.graph.repositories.flatMap(repo => repo.roots) ?? [];
      // Preserve the v1 architecture strip. Detailed declarations occupy separate rows,
      // so hundreds of compiler symbols cannot push its cards out of sight.
      position = known >= 0
        ? { x: known * 230, y: (codeNode ? 600 : 0) + row * 82 }
        : { x: Math.floor(row / 10) * 230, y: 1500 + Math.max(0, roots.indexOf(layer)) * 1000 + (row % 10) * 82 };
      placements.current.set(node.id, position); rows.current.set(bucket, row + 1);
    }
    const status = state(node.id, 'node'), testId = typeof node.attributes.testId === 'string' ? node.attributes.testId : undefined;
    const impactState = changed.has(node.legacyId ?? node.id) || !impactResult && session?.changedPaths.includes(path) ? 'changed' : testId && selectedTests.has(testId) ? 'selected' : affected.has(node.legacyId ?? node.id) || session?.analysis?.federated.affectedNodes.includes(node.id) ? 'affected' : '';
    // Preserve handle bounds when controlled nodes are rebuilt for a new phase.
    // React Flow clears them if a replacement node omits measured dimensions.
    return { id: node.id, position, sourcePosition: Position.Right, targetPosition: Position.Left, width: 200, height: 68, measured: { width: 200, height: 68 }, style: { width: 200, height: 68 },
      className: `flow-node live-node ${status} ${impactState} ${node.kind.includes('contract') || node.kind === 'event-schema' ? 'contract' : ''} ${selection?.id === node.id ? 'inspected' : ''}`,
      data: { label: <div className="flow-label" title={node.label}><small>{layer}</small><span>{node.kind === 'file' ? node.label.split('/').at(-1) : node.label}</span><em>{status !== 'known' ? ({ fresh: 'Nuevo', updated: 'Actualizado', retired: 'Retirado', unverified: 'Pendiente' } as const)[status] : '\u00a0'}</em></div> } };
  });
  const edges: Edge[] = shown.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && (structural || edge.type !== 'contains')).map(edge => ({
    id: edge.id, source: edge.from, target: edge.to, label: relations[edge.type], markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge live-edge ${state(edge.id, 'edge')} ${pathIds.has(edge.id) || selectedEdge?.id === edge.id ? 'focused' : ''}`,
    animated: pathIds.has(edge.id), style: { strokeWidth: selectedEdge?.id === edge.id ? 3 : 1.5 } }));
  useEffect(() => { sourceVersion.current++; setSource(undefined); setSourceError(undefined); }, [session?.id, step?.sequence, selection?.id]);
  useEffect(() => {
    if (!firstFit.current && nodes.length && flow.current) {
      firstFit.current = true; requestAnimationFrame(() => frame('login'));
    }
  }, [nodes.length]);
  function fit(target: Node[], padding: number, minZoom = .015, maxZoom = 1) {
    const container = canvas.current;
    if (!container || !target.length || !flow.current) return;
    // All cards have explicit dimensions. Frame them outside observer delivery;
    // React Flow's queued fitView can resolve synchronously inside its node observer.
    const viewport = getViewportForBounds(flow.current.getNodesBounds(target), container.clientWidth, container.clientHeight, minZoom, maxZoom, padding);
    requestAnimationFrame(() => { void flow.current?.setViewport(viewport); });
  }
  function frame(scope: string) {
    setFraming(scope);
    const focus = shown.nodes.filter(node => {
      const path = node.locations[0]?.path ?? String(node.attributes.path ?? '');
      if (scope === 'login') return node.legacyId ? node.attributes.side === 'frontend' : /\/(LoginPage|LoginForm|LoginButton)\.tsx$/.test(path);
      if (scope === 'http') return ['service', 'endpoint', 'http-contract'].includes(node.kind) && !node.legacyId;
      if (scope === 'events') return ['event-schema', 'channel', 'subscription', 'consumer', 'broker-resource'].includes(node.kind);
      return true;
    });
    fit(nodes.filter(node => focus.some(item => item.id === node.id)), .22, scope === 'all' ? .015 : .32, .9);
  }
  async function openSource(query: Record<string, string>, before: boolean) {
    if (!session || !step) return;
    const revision = ++sourceVersion.current; setSourceError(undefined);
    try {
      const params = new URLSearchParams({ sequence: String(step.sequence), ...query, ...(before ? { side: 'before' } : {}) });
      const response = await fetch(`/api/graph-sessions/${session.id}/locators?${params}`, { headers: { 'X-Test-Impact-Session': token } });
      const body = await response.json() as LocatedSource & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Fuente no disponible.');
      if (revision === sourceVersion.current) setSource(body);
    } catch (error) { if (revision === sourceVersion.current) setSourceError(error instanceof Error ? error.message : 'No se pudo abrir la evidencia.'); }
  }
  const phase = busy ? session?.nextPhase : step ?? session?.nextPhase;
  return <div className="live-process">
    <div className="live-step" data-sequence={session?.sequence ?? 0} aria-live="polite" aria-busy={busy}>
      <div><b>{busy && <i className="process-loader" aria-hidden="true" />}{phase ? `${!busy && step && session && step.sequence < session.sequence ? 'Revisando paso' : 'Paso'} ${busy ? (session?.sequence ?? 0) + 1 : step?.sequence ?? 1}/${session?.total ?? 10} · ${phase.title}` : 'Construir el grafo desde las fuentes'}</b>
        <span className="live-technology">{phase?.technology ?? 'TypeScript Compiler API · adaptadores HTTP / AMQP'}</span>
        {phase?.process && <small className="phase-process"><b>Proceso {busy ? 'en curso' : step ? 'ejecutado' : 'previsto'}</b> · {phase.process}</small>}
        <p>{phase?.explanation ?? 'Empieza con un grafo vacío. Cada paso descubre hechos nuevos y conserva el código que los justifica.'}</p>
        <small>{busy ? `En curso · ${Math.floor(elapsed / 1000)} s` : session?.status === 'error' ? session.error : session?.status === 'cancelled' ? 'Proceso cancelado. Reinicia el grafo para otra ejecución.' : session?.status === 'stale' ? 'Fuentes desactualizadas. Recarga y reconstruye el grafo.' : step?.result ?? '0 nodos · 0 conexiones'}</small>
      </div>
      <div className="live-step-actions"><button className="primary" disabled={busy || executionBusy || quickDisabled} onClick={onRunAll}>{automatic ? 'Ejecutando todo…' : quickLabel}</button><button className="primary" disabled={busy || executionBusy || !!session && ['completed', 'cancelled', 'stale'].includes(session.status)} onClick={onNext}>{busy ? 'Ejecutando…' : session?.status === 'error' ? 'Reintentar fase' : 'Ejecutar siguiente paso'}</button>
        <button onClick={onReset} disabled={busy || executionBusy}>Reiniciar grafo</button>{busy && <><button onClick={onReconcile}>Consultar estado</button><button onClick={onCancel} disabled={executionBusy}>Cancelar</button></>}
        {session?.steps.length ? <label className="step-review">Revisar paso<select aria-label="Revisar paso" value={step?.sequence ?? session.sequence} disabled={busy} onChange={event => onReview(Number(event.target.value))}>{session.steps.map(item => <option key={item.sequence} value={item.sequence}>{item.sequence}. {item.title}</option>)}</select></label> : null}
      </div>
    </div>
    <div className={`live-graph-layout ${selection ? 'with-inspector' : ''}`}>
      <div className="graph-shell live-canvas"><div className="graph-toolbar"><div><b>{session?.kind === 'impact' ? 'ANÁLISIS DE IMPACTO' : 'DESCUBRIMIENTO DE GRAFO'}</b><span>{nodes.length} nodos · {edges.length} conexiones{!structural ? ` · ${shown.nodes.length - nodes.length} archivos ocultos` : ''}</span></div>
        <label><input type="checkbox" checked={structural} onChange={event => setStructural(event.target.checked)} /> Archivos / estructura</label>
        <label>Encuadrar<select aria-label="Encuadrar grafo" value={framing} onChange={event => frame(event.target.value)}><option value="login">Login</option><option value="http">HTTP</option><option value="events">Eventos</option><option value="all">Todo el grafo</option></select></label>
        <select aria-label="Buscar nodo" value="" onChange={event => { const node = nodes.find(item => item.id === event.target.value); if (node) { setSelection({ kind: 'node', id: node.id }); void flow.current?.setCenter(node.position.x + 100, node.position.y + 34, { zoom: .9 }); } }}><option value="">Buscar nodo…</option>{visibleNodes.map(node => <option key={node.id} value={node.id}>{node.kind === 'file' ? node.label.split('/').at(-1) : node.label} · {node.kind}</option>)}</select>
        <button onClick={() => frame(framing)}>Encajar</button>
        <button disabled={!step?.newNodeIds.length && !step?.newEdgeIds.length && !step?.updatedNodeIds.length && !step?.updatedEdgeIds.length} onClick={() => { const discovered = [...(step?.newNodeIds ?? []), ...(step?.updatedNodeIds ?? [])]; const focus = new Set(discovered.length ? discovered : shown.edges.filter(edge => step?.newEdgeIds.includes(edge.id) || step?.updatedEdgeIds.includes(edge.id)).flatMap(edge => [edge.from, edge.to])); fit(nodes.filter(node => focus.has(node.id)), .3); }}>Ver novedades</button>
      </div>
      <div className="live-flow" ref={canvas}><ReactFlow nodes={nodes} edges={edges} minZoom={.015} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false}
        onInit={instance => { flow.current = instance; }} onNodeClick={(_event, node) => setSelection({ kind: 'node', id: node.id })} onEdgeClick={(_event, edge) => setSelection({ kind: 'edge', id: edge.id })}>
        <Background color="#263044" gap={22} size={1} /><MiniMap pannable zoomable nodeStrokeWidth={2} /><Controls showInteractive={false} showFitView={false} />
      </ReactFlow>{!nodes.length && <div className="empty-graph"><h2>El grafo está vacío</h2><p>{step?.id === 'sources' ? 'Fuentes fijadas. El siguiente paso descubrirá archivos y símbolos.' : 'Ejecuta el primer paso para empezar el descubrimiento.'}</p></div>}</div>
      <div className="graph-legend"><span className="changed">Nuevo / actualizado</span><span className="affected">Código afectado</span><span className="selected">Test seleccionado</span><span>Discontinua = retirada / pendiente</span></div></div>
      {selection && <aside className="graph-inspector live-inspector"><div className="panel-title"><span>{selectedNode ? 'ENLACES DEL NODO' : 'EVIDENCIA DEL ENLACE'}</span><button onClick={() => setSelection(undefined)}>Cerrar</button></div>
        <h2>{selectedNode?.label ?? (selectedEdge ? relations[selectedEdge.type] : 'Hecho no disponible en este paso')}</h2>
        {selectedNode && <><p>{kinds[selectedNode.kind]} · {state(selectedNode.id, 'node') === 'unverified' ? 'Fuente base pendiente de revalidar' : 'Fuente del paso seleccionado'}</p>
          {selectedNode.locations.map((location, index) => <button className="evidence-button" key={index} onClick={() => openSource({ node: selectedNode.id, index: String(index) }, !session?.graph.nodes.some(node => node.id === selectedNode.id))}>Ver declaración · {location.path}</button>)}
          {typeof selectedNode.attributes.testId === 'string' && <button onClick={() => onTest(String(selectedNode.attributes.testId))}>Ver detalle del test</button>}
          <div className="node-link-list">{nodeEdges.map(edge => <button key={edge.id} onClick={() => setSelection({ kind: 'edge', id: edge.id })}>{relations[edge.type]} · {nodeMap.get(edge.from)?.label} → {nodeMap.get(edge.to)?.label}</button>)}</div>
          {!nodeEdges.length && <p>Aún no hay enlaces descubiertos para este nodo.</p>}</>}
        {selectedEdge && <><p>{nodeMap.get(selectedEdge.from)?.label} → {nodeMap.get(selectedEdge.to)?.label}</p>{proofs.map(proof => <div className="live-proof" key={proof.id}><b>{proof.kind === 'configuration' ? 'Configuración explícita' : proof.kind === 'reviewed-declaration' ? 'Declaración revisada · no cobertura' : 'Hecho estático del código'}</b><p>{proof.reason}</p><small>{proof.extractor.id} · v{proof.extractor.version}</small>
          {'path' in proof.locator && <button className="evidence-button" onClick={() => openSource({ evidence: proof.id }, !session?.graph.evidence.some(item => item.id === proof.id))}>Abrir evidencia · {proof.locator.path}</button>}</div>)}</>}
        {sourceError && <p role="alert">{sourceError}</p>}
        {session && <details className="live-observations"><summary>Observaciones correlacionadas</summary><p>Capturas fijadas a su revisión y ventana; no tráfico nuevo del overlay.</p>{session.graph.observations.filter(item => selectedNode ? item.correlation.nodeIds.includes(selectedNode.id) : selectedEdge ? item.correlation.edgeIds.includes(selectedEdge.id) : false).map(item => <div key={item.id}><b>{item.serviceId} · {item.serviceVersion}</b><p>{item.window.start} → {item.window.end}</p><p>{item.correlation.reason}</p><pre>{JSON.stringify(item.span ?? item, null, 2)}</pre></div>)}{!session.graph.observations.length && <p>Sin trazas cargadas. El paso de observaciones no inicia instrumentación.</p>}{session.graph.mesh && <pre>{JSON.stringify(session.graph.mesh, null, 2)}</pre>}</details>}
        {source && <div className="live-source"><div><b>{source.path}</b><span>Líneas {source.start.line}–{source.end.line} · fuente fijada</span></div><Editor key={`${source.snapshotId}:${source.path}:${source.start.line}`} value={source.content} language={source.path.endsWith('.json') ? 'json' : 'typescript'} theme="vs-dark"
          onMount={(editor, monaco) => { deferMonacoLayout(editor); editor.revealLineInCenter(source.start.line); editor.createDecorationsCollection([{ range: new monaco.Range(source.start.line, source.start.column, source.end.line, source.end.column), options: { className: 'test-source-highlight', isWholeLine: true } }]); }}
          options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: false, fontSize: 11, scrollBeyondLastLine: false }} /></div>}
      </aside>}
    </div>
    <details className="process-console" open={!!session?.steps.length}>
      <summary>Registro de procesos · {session?.steps.length ?? 0} fases completadas</summary>
      <p>Las fases se ejecutan como funciones del backend Node.js. Estas líneas describen el proceso real; no son comandos de shell ni ejecuciones de tests.</p>
      <div ref={processLog} className="process-console-log" role="log" aria-label="Registro de procesos" aria-live="polite">
        {!session?.steps.length && <p>Esperando descubrimiento. Cada fase añadirá su tecnología, proceso, duración y resultado.</p>}
        {session?.steps.map(item => <article key={item.sequence} data-phase={item.id}>
          <b>[{item.sequence}/{session.total}] {item.title} · {Math.round(item.durationMs)} ms</b>
          <span>{item.technology}</span><code>{item.process}</code><p>{item.result}</p>
        </article>)}
        {busy && session?.nextPhase && <article className="running"><b>EN CURSO · {session.nextPhase.title}</b><span>{session.nextPhase.technology}</span><code>{session.nextPhase.process}</code></article>}
        {session?.status === 'error' && <p role="alert">Fase fallida: {session.error}</p>}
        {session?.status === 'cancelled' && <p>Proceso cancelado; se conservan las fases confirmadas.</p>}
      </div>
    </details>
    {!!session?.graph.diagnostics.length && <details className="live-diagnostics"><summary>Diagnósticos del mapeo · {session.graph.diagnostics.length}</summary>{session.graph.diagnostics.map(item => <p key={item.id}><b>{item.code}</b> · {item.message}</p>)}</details>}
  </div>;
}
