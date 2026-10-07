import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, Position, ReactFlow, type Node, type Edge } from '@xyflow/react';
import type { DemoAnalysis, DemoMapping, DemoOperation, DemoSnapshot, LocatedSource } from '../types';
import type { JourneyId } from '../journeys';
import { guidedFacts, layoutFacts, nodeLabels, relationLabels } from '../guided-view';
import { SourcePreview } from './DiscoveryExplorer';

const mappingLabels: Record<DemoMapping['state'], string> = { empty: 'Sin mapeo', building: 'Construyendo', ready: 'Mapeo listo', stale: 'Mapeo desactualizado', error: 'Error de construcción' };
export function GuidedProcess({ snapshot, analysis, operation, mapping, journey, pending, pendingKind, executionBusy, hasChanges, focusEdge, focusTest, onBuild, onClear, onCalculate, onTests, onAdvanced }: {
  snapshot: DemoSnapshot; analysis?: DemoAnalysis; operation?: DemoOperation; mapping: DemoMapping; journey: JourneyId;
  pending: boolean; pendingKind?: DemoOperation['kind']; executionBusy: boolean; hasChanges: boolean; focusEdge?: string; focusTest?: string;
  onBuild: () => void; onClear: () => void; onCalculate: () => void; onTests: () => void; onAdvanced: () => void;
}) {
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<string>();
  const [source, setSource] = useState<LocatedSource>();
  const [error, setError] = useState<string>();
  const [historicalEdge, setHistoricalEdge] = useState<string>();
  const sourceVersion = useRef(0);
  const events = operation?.events ?? [];
  const event = events[Math.min(step, Math.max(0, events.length - 1))];
  const previousEvent = event?.status === 'running' ? events[Math.max(0, step - 1)] : event;
  const focusedEdge = historicalEdge ?? focusEdge;
  const before = Boolean(historicalEdge) || event?.side === 'before' || Boolean(focusedEdge && !analysis?.discovery.edges.some(edge => edge.id === focusedEdge));
  const graph = !before && analysis ? analysis.discovery : snapshot.discovery;
  const paths = focusTest ? analysis?.result.explanations.find(reason => reason.testId === focusTest)?.path.map(item => item.edgeId) ?? [] : [];
  const facts = useMemo(() => guidedFacts(graph, previousEvent, journey, focusedEdge, paths), [graph, previousEvent, journey, focusedEdge, focusTest]);
  const defaultEdge = facts.edges.find(edge => edge.type === 'subscribes') ?? facts.edges[0];
  const selectedEdge = graph.edges.find(edge => edge.id === (selection ?? focusedEdge ?? defaultEdge?.id));
  const proof = selectedEdge && graph.evidence.find(item => item.id === selectedEdge.evidenceIds.find(id => graph.evidence.find(proof => proof.id === id)?.locator.kind === 'configuration'))
    || (selectedEdge && graph.evidence.find(item => item.id === selectedEdge.evidenceIds[0]));
  const diagnostic = graph.diagnostics.find(item => event?.diagnosticIds.includes(item.id) && ['missing-contract', 'dynamic-reference'].includes(item.code))
    ?? graph.diagnostics.find(item => event?.diagnosticIds.includes(item.id));
  const noHttpBinding = ['http', 'unresolved'].includes(journey) && !before
    && ['http', 'messaging', 'observations', 'validation', 'delta', 'policies', 'uncertainty', 'selection'].includes(event?.phase ?? '')
    && graph.diagnostics.some(item => ['missing-contract', 'dynamic-reference'].includes(item.code));
  useEffect(() => { setStep(0); setSelection(undefined); setHistoricalEdge(undefined); setSource(undefined); setError(undefined); sourceVersion.current++; }, [operation?.id, journey]);
  useEffect(() => { if (focusEdge || focusTest) setStep(Math.max(0, events.length - 1)); }, [focusEdge, focusTest]);
  useEffect(() => { setSelection(undefined); setHistoricalEdge(undefined); setSource(undefined); setError(undefined); sourceVersion.current++; }, [step]);
  useEffect(() => { setSelection(undefined); setSource(undefined); setError(undefined); sourceVersion.current++; }, [graph.id]);
  const removedBinding = analysis?.delta.edges.removed.find(edge => edge.type === (journey === 'event' ? 'publishes' : 'invokes-endpoint'));
  function chooseEdge(id?: string) {
    sourceVersion.current++; setSelection(id); setSource(undefined); setError(undefined);
  }
  async function openEvidence(evidenceId: string) {
    const revision = ++sourceVersion.current;
    setError(undefined);
    try {
      const response = await fetch(`/api/snapshots/${graph.id}/locators?evidence=${encodeURIComponent(evidenceId)}`);
      const body = await response.json() as LocatedSource & { error?: string };
      if (revision !== sourceVersion.current) return;
      if (!response.ok || body.snapshotId !== graph.id) throw new Error(body.error ?? 'Evidencia no disponible.');
      setSource(body);
    } catch (cause) { if (revision === sourceVersion.current) setError(cause instanceof Error ? cause.message : 'No se pudo abrir la evidencia.'); }
  }
  const layout = layoutFacts(facts.nodes, facts.edges);
  const nodes: Node[] = facts.nodes.map(item => ({ id: item.id, position: layout.find(node => node.id === item.id)!.position, sourcePosition: Position.Right, targetPosition: Position.Left,
    data: { label: <div className="guided-node-label"><small>{nodeLabels[item.kind]}</small><b>{item.label}</b>{analysis?.delta.nodes.added.some(node => node.id === item.id) && <em>Añadido</em>}</div> },
    className: 'guided-flow-node', style: { width: 200 } }));
  const edges: Edge[] = facts.edges.map(edge => ({ id: edge.id, source: edge.from, target: edge.to, type: 'smoothstep', label: relationLabels[edge.type], markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge ${edge.id === selectedEdge?.id ? 'focused' : ''}`, style: { strokeWidth: 2 } }));
  const usable = mapping.state === 'ready';
  return <section className="guided-process" aria-label="Descubrimiento explicado">
    <div className="guided-actions"><div><span className="guided-eyebrow">DEL CÓDIGO A LOS TESTS</span><h1>Descubre el grafo, paso a paso</h1></div><span className={`mapping-status ${mapping.state}`} role="status">{mappingLabels[mapping.state]}</span>
      <div className="guided-buttons"><button className="primary" onClick={onBuild} disabled={pending || executionBusy}>{mapping.state === 'ready' ? 'Reconstruir desde cero' : 'Generar mapeo'}</button><button onClick={onClear} disabled={pending || executionBusy || mapping.state === 'empty'} title={executionBusy ? 'Espera a que termine la ejecución para borrar el mapeo.' : undefined}>Borrar mapeo</button><button onClick={onCalculate} disabled={pending || mapping.state !== 'ready' || !hasChanges} title={!hasChanges ? 'Aplica un journey o modifica el código para calcular su impacto.' : undefined}>Calcular test impact</button><button onClick={onAdvanced} disabled={!usable}>Explorador técnico</button></div>
    </div>
    <div className="guided-map-layout">
      <div className="guided-map"><div className="guided-map-heading"><b>{usable ? facts.scope : 'Mapeo activo'}</b><span>{before ? 'Antes del cambio' : analysis ? 'Después del cambio' : 'Fuentes base'} · {usable ? facts.nodes.length : 0} elementos</span></div>
        {!usable ? <div className="guided-empty"><h2>{mapping.state === 'empty' ? 'El mapeo está vacío' : mappingLabels[mapping.state]}</h2><p>El código y tus cambios siguen disponibles. Genera el mapeo para descubrir relaciones y calcular impacto.</p></div>
          : !nodes.length ? <div className="guided-empty"><h2>{noHttpBinding ? 'No hay un binding HTTP verificable' : event?.phase === 'inventory' ? 'Primero identificamos las fuentes' : 'Todavía no hay relaciones en esta fase'}</h2><p>{noHttpBinding ? 'El adaptador no ha podido demostrar esta conexión. Abre el binding anterior para ver qué relación se ha retirado.' : 'Avanza para ver los hechos que produzca el siguiente extractor.'}</p>{event?.paths && <ul>{event.paths.filter(path => journey === 'screen' ? /LoginPage/.test(path) : /InventoryClient|notifications|topology/.test(path)).slice(0, 5).map(path => <li key={path}>{path}</li>)}</ul>}</div>
            : <div className="guided-canvas"><ReactFlow key={`${graph.id}:${event?.phase}:${journey}:${focusEdge}:${focusTest}`} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .15 }} minZoom={.25} maxZoom={1.8} nodesDraggable nodesConnectable={false}
              onEdgeClick={(_event, edge) => chooseEdge(edge.id)} onNodeClick={(_event, node) => { const edge = facts.edges.find(edge => edge.from === node.id || edge.to === node.id); chooseEdge(edge?.id); }}>
              <Background gap={25} color="#253248" /><Controls showInteractive={false} /></ReactFlow></div>}
        <div className="guided-map-note">Flechas: consumidor → dependencia. Cada conexión remite a hechos del mapeo completo.</div>
      </div>
      <aside className="guided-inspector" aria-label="Evidencia de la fase">
        {source ? <SourcePreview source={source} simple onBack={() => setSource(undefined)} /> : <><span className="guided-eyebrow">POR QUÉ EXISTE ESTA RELACIÓN</span>
          {usable && facts.edges.length > 0 && !historicalEdge && <label className="guided-relation-choice">Relación visible<select aria-label="Relación visible" value={selectedEdge?.id ?? ''} onChange={event => chooseEdge(event.target.value)}>{facts.edges.map(edge => <option key={edge.id} value={edge.id}>{relationLabels[edge.type]} · {graph.nodes.find(node => node.id === edge.from)?.label} → {graph.nodes.find(node => node.id === edge.to)?.label}</option>)}</select></label>}
          {selectedEdge && proof && usable ? <><h2>{relationLabels[selectedEdge.type]}{historicalEdge ? ' · relación retirada' : ''}</h2><p>{graph.nodes.find(node => node.id === selectedEdge.from)?.label} → {graph.nodes.find(node => node.id === selectedEdge.to)?.label}</p><p>{proof.kind === 'configuration' ? 'El adaptador encuentra esta conexión en una declaración explícita de la configuración.' : proof.kind === 'reviewed-declaration' ? 'Una declaración revisada vincula estas piezas. Expresa intención del test, sin medir cobertura.' : 'El extractor encuentra esta conexión en el código. Abre la evidencia para ver la declaración que la demuestra.'}</p><span className="evidence-kind">{proof.kind === 'configuration' ? 'Configuración explícita' : proof.kind === 'reviewed-declaration' ? 'Declaración revisada · no es cobertura' : 'Hecho estático del código'}</span>
            {event?.snapshotId && <button className="evidence-button" onClick={() => openEvidence(proof.id)}>Abrir evidencia</button>}
            <details><summary>Detalle técnico</summary><p>{proof.reason}</p><p>{proof.extractor.id} · {proof.locator.kind}</p><code>{'path' in proof.locator ? proof.locator.path : 'Sin fuente navegable'}</code></details>
          </> : <p>La consola explica la fase elegida. Selecciona una relación cuando aparezca para abrir el código o la configuración que la demuestra.</p>}
          {diagnostic && (['missing-contract', 'dynamic-reference'].includes(diagnostic.code) ? <div className="guided-diagnostic"><b>{diagnostic.code}</b><p>{diagnostic.code === 'missing-contract' ? 'El contrato, su versión y el binding no coinciden. El adaptador conserva el diagnóstico y no crea la conexión.' : 'El destino depende de una expresión que este adaptador no puede resolver de forma verificable.'}</p><details><summary>Diagnóstico completo</summary><p>{diagnostic.message}</p></details></div> : <details><summary>Límite de detección · {diagnostic.code}</summary><p>{diagnostic.message}</p></details>)}
          {removedBinding && <button className="evidence-button" onClick={() => { setHistoricalEdge(current => current ? undefined : removedBinding.id); setSource(undefined); }}>{historicalEdge ? 'Volver al mapa posterior' : 'Ver binding retirado · antes del cambio'}</button>}
          {error && <p role="alert">{error}</p>}
        </>}
      </aside>
    </div>
    <section className="process-console" aria-label="Consola del proceso">
      <div className="console-heading"><div><b>Consola del proceso</b><span>{(operation?.kind ?? pendingKind) === 'analysis' ? 'Cálculo de impacto' : 'Construcción del mapeo'} · {operation?.status === 'completed' ? 'Motor terminado' : operation?.status === 'failed' ? 'Motor fallido' : pending ? operation ? 'Motor en curso' : 'Preparando operación' : 'Sin operación activa'}</span></div><div className="console-controls"><button onClick={() => setStep(value => Math.max(0, value - 1))} disabled={!events.length || step === 0}>Anterior</button><button onClick={() => setStep(value => Math.min(events.length - 1, value + 1))} disabled={!events.length || step >= events.length - 1}>Siguiente</button><button onClick={() => setStep(events.length - 1)} disabled={!events.length}>Ver resultado</button></div></div>
      {!!events.length && <div className="console-phases" aria-label="Fases registradas">{events.map((item, index) => <button key={index} onClick={() => setStep(index)} aria-pressed={step === index}>{index + 1}. {item.title}{item.status === 'failed' ? ' · error' : ''}</button>)}</div>}
      <div className="console-current" aria-live="polite">{event ? <><span className="console-sequence">{Math.min(step + 1, events.length)} / {events.length}</span><div><h2>{event.title}</h2><p>{event.message}</p><details open><summary>Técnica utilizada</summary><p>{event.technique}</p></details>{event.warnings?.length ? <details><summary>Motivos de la selección conservadora · {event.warnings.length}</summary><ul>{event.warnings.map(reason => <li key={reason}>{reason}</li>)}</ul></details> : null}
          {Object.keys(event.counts).length > 0 && <div className="console-counts">{Object.entries(event.counts).map(([key, value]) => <span key={key}>{value} {{ files: 'archivos', repositories: 'repositorios con fuente', nodes: 'nodos', edges: 'relaciones', diagnostics: 'diagnósticos', newEvidence: 'evidencias de esta fase', observations: 'observaciones', added: 'relaciones añadidas', removed: 'relaciones retiradas', selected: 'tests locales seleccionados', local: 'tests locales registrados', suites: 'suites distribuidas seleccionadas' }[key] ?? key}</span>)}</div>}
          <small>Revisión de hechos registrados. Avanzar no vuelve a ejecutar el motor.</small></div></> : <p>{mapping.state === 'empty' ? 'Has borrado el mapeo activo. Pulsa Generar mapeo para registrar una nueva construcción.' : 'La operación registrará aquí las técnicas y evidencias de cada fase.'}</p>}
      </div>
      {operation?.error && <p className="console-error" role="alert">{operation.error}</p>}
      {analysis && <div className="guided-result"><b>{analysis.result.selectionMode === 'conservative-full' ? 'Selección local conservadora' : 'Selección por caminos causales'}</b><span>{analysis.result.selectedTests.length} / {snapshot.catalogue.length} tests locales · {analysis.federated.suites.filter(suite => suite.selected).length} suites distribuidas · sin ejecutar hasta lanzar runners</span><button className="primary" onClick={onTests}>Revisar y ejecutar tests</button></div>}
    </section>
  </section>;
}
