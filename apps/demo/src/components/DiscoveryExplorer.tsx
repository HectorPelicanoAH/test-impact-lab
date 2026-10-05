import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EdgeKind, EdgeV2, EvidenceV2, GraphSnapshotV2, NodeV2, SourceLocation } from '../../../../packages/impact-engine/src/schema-v2';
import { changeStatus, graphForSide, neighborhood, relatedLegacyEdge, sourceArea, visibleGraph, type RevisionSide, type SourceKind } from '../discovery-view';
import { pathLabels } from './ImpactSummary';
import type { DemoAnalysis, DemoSnapshot, LocatedSource } from '../types';

type Level = 'system' | 'service' | 'code';
type Selection = { kind: 'node' | 'edge'; id: string };
const relationTypes: EdgeKind[] = ['imports', 'calls', 'renders', 'routes', 'implements', 'exercises', 'contains', 'realizes', 'injects', 'exposes', 'invokes-endpoint', 'publishes', 'subscribes', 'processes'];
const evidenceKinds: SourceKind[] = ['all', 'static', 'reviewed-declaration', 'configuration', 'measured-coverage', 'observation'];
const short = (id: string) => id.slice(0, 12);

function SourcePreview({ source, onBack }: { source: LocatedSource; onBack: () => void }) {
  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => { highlighted.current?.scrollIntoView({ block: 'center' }); }, [source]);
  const lines = source.content.split('\n');
  return <section className="evidence-preview" aria-label="Versioned source"><div className="evidence-preview-head"><button onClick={onBack}>← BACK TO PATH</button><b>{source.path}</b></div>
    <p>{source.kind} · snapshot {short(source.snapshotId)} · revision {source.revision}</p>
    {source.pointer && <p>Reviewed JSON pointer: <code>{source.pointer}</code>{source.relatedSource && <> · related source (no proven range): {source.relatedSource}</>}</p>}
    <p>Verified SHA-256: <code>{source.sourceHash}</code>. Highlighted positions are 1-based UTF-16, end exclusive: {source.start.line}:{source.start.column} → {source.end.line}:{source.end.column}.</p>
    <div className="evidence-lines" role="region" aria-label={`Archived ${source.path} source`} tabIndex={0}>
      {lines.map((line, index) => {
        const number = index + 1;
        const marked = number >= source.start.line && (number < source.end.line || (number === source.end.line && source.end.column > 1));
        const from = number === source.start.line ? source.start.column - 1 : 0;
        const to = number === source.end.line ? source.end.column - 1 : line.length;
        return <div key={index} className={marked ? 'evidence-line active' : 'evidence-line'} ref={number === source.start.line ? highlighted : undefined}>
          <span className="evidence-line-number">{number}</span><code>{marked ? <>{line.slice(0, from)}<mark>{line.slice(from, to) || ' '}</mark>{line.slice(to)}</> : line || ' '}</code>
        </div>;
      })}
    </div>
  </section>;
}

export function DiscoveryExplorer({ snapshot, analysis, focusTest, onFocusTest }: {
  snapshot: DemoSnapshot; analysis?: DemoAnalysis; focusTest?: string; onFocusTest: (id?: string) => void;
}) {
  const [level, setLevel] = useState<Level>('code');
  const [side, setSide] = useState<RevisionSide>('after');
  const [scope, setScope] = useState('all');
  const [relation, setRelation] = useState<EdgeKind | 'all'>('all');
  const [provenance, setProvenance] = useState<SourceKind>('all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>();
  const [source, setSource] = useState<LocatedSource>();
  const [sourceError, setSourceError] = useState<string>();
  const requestVersion = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<Node, Edge>>(null);
  const before = snapshot.discovery;
  const after = analysis?.discovery;
  const currentSide = side === 'after' && after ? side : 'before';
  const graph = graphForSide(before, after, currentSide);
  const roots = useMemo(() => graph.repositories.flatMap(repository => repository.roots), [graph]);
  const view = useMemo(() => visibleGraph(graph, roots, scope, relation, provenance), [graph, roots, scope, relation, provenance]);
  const nodeMap = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const selectedNode = selection?.kind === 'node' ? nodeMap.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? graph.edges.find(edge => edge.id === selection.id) : undefined;
  const evidence = selectedEdge ? selectedEdge.evidenceIds.map(id => graph.evidence.find(item => item.id === id)).filter((item): item is EvidenceV2 => Boolean(item)) : [];
  const paths = focusTest && analysis ? analysis.result.explanations.find(item => item.testId === focusTest)?.path ?? [] : [];
  const labels = focusTest && analysis ? pathLabels(focusTest, analysis.result, analysis.graph) : [];
  useEffect(() => { requestVersion.current++; setSelection(undefined); setSource(undefined); setSourceError(undefined); setSide('after'); }, [snapshot.id, analysis?.id]);

  function select(kind: Selection['kind'], id: string, revision: RevisionSide = currentSide) {
    requestVersion.current++; setSide(revision); setSelection({ kind, id }); setSource(undefined); setSourceError(undefined);
  }
  async function openSource(reference: { evidence: string } | { node: string; index: number }) {
    const version = ++requestVersion.current;
    setSource(undefined); setSourceError(undefined);
    const parameters = new URLSearchParams('evidence' in reference ? { evidence: reference.evidence } : { node: reference.node, index: String(reference.index) });
    try {
      const response = await fetch(`/api/snapshots/${graph.id}/locators?${parameters}`);
      const body = await response.json() as LocatedSource & { error?: string };
      if (version !== requestVersion.current) return;
      if (!response.ok || body.snapshotId !== graph.id) throw new Error(body.error ?? 'Archived source unavailable.');
      setSource(body);
    } catch (error) {
      if (version === requestVersion.current) setSourceError(error instanceof Error ? error.message : 'Archived source unavailable.');
    }
  }
  function legacyStep(edgeId: string) {
    const found = relatedLegacyEdge(graph, edgeId);
    if (found) select('edge', found.id);
    else if (after) {
      const previous = relatedLegacyEdge(before, edgeId);
      if (previous) select('edge', previous.id, 'before');
      else setSourceError('This historical selection step has no verified v2 edge; no source link is offered.');
    }
  }
  // Keep the full filtered index; the canvas shows a legible, bounded neighborhood.
  const canvasNodes = useMemo(() => {
    const anchors = selection?.kind === 'node' ? [selection.id] : selection?.kind === 'edge'
      ? graph.edges.filter(edge => edge.id === selection.id).flatMap(edge => [edge.from, edge.to]) : [];
    const allowed = new Set(view.nodes.map(node => node.id));
    const adjacent = view.edges.filter(edge => anchors.includes(edge.from) || anchors.includes(edge.to)).flatMap(edge => [edge.from, edge.to]);
    const areas = ['Other / tests', ...roots];
    const buckets = areas.map(area => view.nodes.filter(node => sourceArea(node, roots) === area));
    const balanced: NodeV2[] = [];
    for (let index = 0; buckets.some(bucket => index < bucket.length); index++) {
      for (const bucket of buckets) if (bucket[index]) balanced.push(bucket[index]!);
    }
    const ids = [...new Set(anchors.length ? [...anchors, ...adjacent] : balanced.map(node => node.id))].filter(id => allowed.has(id)).slice(0, 20);
    return ids.map(id => view.nodes.find(node => node.id === id)!);
  }, [view, roots, graph, selection]);
  const { nodes, edges } = useMemo(() => {
    const items: Node[] = canvasNodes.map((item, index) => {
      const state = changeStatus(item.id, 'nodes', currentSide, analysis?.delta);
      return { id: item.id, position: { x: index % 4 * 250, y: Math.floor(index / 4) * 98 },
        data: { label: <div className="flow-label"><small>{item.kind} · {state}</small><span>{item.label}</span></div> },
        className: `flow-node discovery-node ${state} ${selection?.kind === 'node' && selection.id === item.id ? 'focused' : ''}`,
        style: { width: 220 }, ariaLabel: `${item.kind} ${item.label} (${state})` };
    });
    const visibleIds = new Set(canvasNodes.map(node => node.id));
    const links: Edge[] = view.edges.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to)).map(edge => ({ id: edge.id, source: edge.from, target: edge.to, label: edge.type,
      markerEnd: { type: MarkerType.ArrowClosed }, className: `flow-edge ${changeStatus(edge.id, 'edges', currentSide, analysis?.delta)} ${selection?.kind === 'edge' && selection.id === edge.id ? 'focused' : ''}` }));
    return { nodes: items, edges: links };
  }, [view, canvasNodes, currentSide, analysis?.delta, selection]);
  useEffect(() => {
    if (!canvas.current) return;
    const resize = new ResizeObserver(() => { void flow.current?.fitView({ padding: 0.15, duration: 0 }); });
    resize.observe(canvas.current);
    return () => resize.disconnect();
  }, []);
  const matchingNodes = view.nodes.filter(node => (node.label + node.id + (node.locations[0]?.path ?? '')).toLowerCase().includes(query.toLowerCase()));
  const groupCounts = roots.map(root => ({ root, nodes: graph.nodes.filter(node => sourceArea(node, roots) === root).length,
    edges: graph.edges.filter(edge => sourceArea(nodeMap.get(edge.from)!, roots) === root && sourceArea(nodeMap.get(edge.to)!, roots) === root).length }));
  const sameRevision = (edge: EdgeV2) => `${nodeMap.get(edge.from)?.label ?? edge.from} → ${nodeMap.get(edge.to)?.label ?? edge.to}`;
  const delta = analysis?.delta;
  function deltaItems(kind: 'nodes' | 'edges', revision: RevisionSide) {
    const list = revision === 'before' ? delta?.[kind].removed : delta?.[kind].added;
    return list?.slice(0, 30).map(item => <li key={item.id}><button onClick={() => { select(kind === 'nodes' ? 'node' : 'edge', item.id, revision); setLevel('code'); setScope('all'); setRelation('all'); setProvenance('all'); }}>
      {kind === 'nodes' ? (item as NodeV2).label : (item as EdgeV2).type} <small>{short(item.id)}</small></button></li>);
  }
  return <div className="discovery-layout">
    <div className="discovery-main">
      <div className="graph-toolbar discovery-toolbar"><div><b>VERSIONED DEPENDENCIES</b><span>{graph.nodes.length} nodes · {graph.edges.length} edges · {graph.diagnostics.length} diagnostics</span></div>
        <span className="revision-tag">{currentSide.toUpperCase()} {short(graph.id)}</span></div>
      <div className="discovery-controls" aria-label="Graph controls">
        <fieldset><legend>View</legend>{(['system', 'service', 'code'] as const).map(item => <button key={item} aria-pressed={level === item} onClick={() => setLevel(item)}>{item.toUpperCase()}</button>)}</fieldset>
        {analysis && <fieldset><legend>Revision</legend>{(['before', 'after'] as const).map(item => <button key={item} aria-pressed={currentSide === item} onClick={() => { requestVersion.current++; setSide(item); setSelection(undefined); setSource(undefined); }}>{item.toUpperCase()}</button>)}</fieldset>}
        <p><b>Fact direction:</b> consumer → dependency. <b>Impact:</b> policy-dependent, often reverse. Structural edges and cross-contract paths do not imply universal reverse reachability.</p>
      </div>
      {level === 'system' && <div className="discovery-cards"><h2>System · recorded repositories</h2>{graph.repositories.map(repo => <button key={repo.repositoryId} className="discovery-card" onClick={() => setLevel('service')}><b>{repo.productId} / {repo.repositoryId}</b><span>{repo.availability} · {repo.roots.length} configured source areas · {graph.nodes.filter(node => node.productId === repo.productId && node.repositoryId === repo.repositoryId).length} nodes</span><small>Revision {repo.revision} · browse source areas →</small></button>)}</div>}
      {level === 'service' && <div className="discovery-cards"><h2>Source areas · not inferred runtime services</h2><p>Grouping by declared roots only. A code edge crossing roots is shown as evidence, not as an invented service call.</p>{groupCounts.map(group => <button key={group.root} className="discovery-card" onClick={() => { setScope(group.root); setLevel('code'); }}><b>{group.root}</b><span>{group.nodes} nodes · {group.edges} internal evidenced edges</span><small>Inspect code →</small></button>)}
        <button className="discovery-card" onClick={() => { setScope('all'); setLevel('code'); }}>ALL ROOTS / TESTS →</button></div>}
      {level === 'code' && <><div className="discovery-filters">
        <label>Area<select aria-label="Source area" value={scope} onChange={event => setScope(event.target.value)}><option value="all">All areas</option>{roots.map(root => <option key={root} value={root}>{root}</option>)}<option value="Other / tests">Other / tests</option></select></label>
        <label>Relation<select aria-label="Relation type" value={relation} onChange={event => setRelation(event.target.value as EdgeKind | 'all')}><option value="all">All types</option>{relationTypes.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Evidence<select aria-label="Evidence kind" value={provenance} onChange={event => setProvenance(event.target.value as SourceKind)}>{evidenceKinds.map(item => <option key={item} value={item}>{item === 'all' ? 'All kinds' : item}</option>)}</select></label>
      </div><div ref={canvas} className="graph-shell discovery-canvas"><ReactFlow key={`${graph.id}:${scope}:${relation}:${provenance}:${selection?.kind}:${selection?.id}`} nodes={nodes} edges={edges} fitView minZoom={0.08} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false}
        onInit={instance => { flow.current = instance; }}
        onNodeClick={(_event, node) => select('node', node.id)} onEdgeClick={(_event, edge) => select('edge', edge.id)}>
        <Background color="#263044" gap={22} size={1} /><MiniMap pannable zoomable nodeStrokeWidth={2} /><Controls showInteractive={false} />
      </ReactFlow></div><div className="discovery-index"><p className="discovery-canvas-note">Canvas: {canvasNodes.length} of {view.nodes.length} filtered nodes · select a node/edge to see its neighborhood; search below for every node.</p><label htmlFor="graph-search">Search graph nodes</label><input id="graph-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, path or ID" />
        <ul className="discovery-results" aria-label="Graph nodes">{matchingNodes.slice(0, 60).map(node => <li key={node.id}><button onClick={() => select('node', node.id)}>{node.kind} · {node.label} <small>{changeStatus(node.id, 'nodes', currentSide, delta)}</small></button></li>)}</ul><small>{matchingNodes.length} matching nodes; first 60 shown. Click a node to browse its dependencies and consumers.</small></div></>}
    </div>
    <aside className="graph-inspector panel discovery-inspector" aria-label="Evidence inspector"><div className="panel-title">EVIDENCE INSPECTOR</div>
      {source ? <SourcePreview source={source} onBack={() => setSource(undefined)} /> : <>
        {sourceError && <p className="evidence-error" role="alert">{sourceError}</p>}
        {selectedNode && <section><h2>{selectedNode.label}</h2><p><b>Node:</b> {selectedNode.kind} · {changeStatus(selectedNode.id, 'nodes', currentSide, delta)}</p><p>{selectedNode.productId} / {selectedNode.repositoryId} · revision {graph.repositories.find(repo => repo.productId === selectedNode.productId && repo.repositoryId === selectedNode.repositoryId)?.revision} · {graph.repositories.find(repo => repo.productId === selectedNode.productId && repo.repositoryId === selectedNode.repositoryId)?.availability}</p><code className="discovery-id">{selectedNode.id}</code>
          <h3>Verified locations</h3>{selectedNode.locations.length ? selectedNode.locations.map((location, index) => <button className="evidence-button" key={index} onClick={() => openSource({ node: selectedNode.id, index })}>{location.path}:{location.start.line}:{location.start.column} → {location.end.line}:{location.end.column} · OPEN ARCHIVED CODE</button>) : <p>Source/range unavailable in this snapshot; no code link is offered.</p>}
          <h3>Dependencies · outgoing facts</h3>{neighborhood(graph, selectedNode.id).dependencies.map(edge => <button className="evidence-button" key={edge.id} onClick={() => select('edge', edge.id)}>{edge.type} → {nodeMap.get(edge.to)?.label ?? edge.to}</button>)}
          <h3>Consumers · incoming facts</h3>{neighborhood(graph, selectedNode.id).consumers.map(edge => <button className="evidence-button" key={edge.id} onClick={() => select('edge', edge.id)}>{nodeMap.get(edge.from)?.label ?? edge.from} → {edge.type}</button>)}
        </section>}
        {selectedEdge && <section><h2>{selectedEdge.type} · {changeStatus(selectedEdge.id, 'edges', currentSide, delta)}</h2><p><b>Fact:</b> {sameRevision(selectedEdge)}</p><p><b>Direction:</b> consumer → dependency; impact follows only the policy below, not necessarily the same arrow.</p><p>Policy: {selectedEdge.policyRef} · {graph.policies.find(item => item.id === selectedEdge.policyRef)?.kind}</p>
          <h3>Provenance · {evidence.length} occurrence{evidence.length === 1 ? '' : 's'}</h3>{evidence.map(item => <article className="evidence-record" key={item.id}><b>{item.kind} · {item.resolution}</b><p>{item.reason}</p><small>Extractor {item.extractor.id} v{item.extractor.version} · revision {item.revision}</small><p>{item.locator.kind === 'source' ? `${item.locator.path}:${item.locator.start.line}:${item.locator.start.column}` : item.locator.kind === 'declaration' || item.locator.kind === 'configuration' ? `${item.locator.path} ${item.locator.pointer} (${item.locator.kind === 'configuration' ? 'configuration' : 'reviewed declaration'}, not measured coverage)` : `No navigable source for ${item.locator.kind}`}</p>
            {(item.locator.kind === 'source' || item.locator.kind === 'declaration' || item.locator.kind === 'configuration') ? <button className="evidence-button" onClick={() => openSource({ evidence: item.id })}>OPEN VERIFIED {item.locator.kind === 'source' ? 'CODE' : 'CONFIGURATION'} →</button> : <p>Source/range unavailable; no link offered.</p>}
          </article>)}
        </section>}
        {!selection && <p>Select a node or edge in the canvas, the keyboard list, a path or the delta to inspect verified evidence.</p>}
        {focusTest && analysis && <section className="inspector-section"><h3>SELECTION PATH · {focusTest}</h3><p>{analysis.result.explanations.find(reason => reason.testId === focusTest)?.reason}</p>{paths.length ? paths.map((step, index) => <button className="evidence-button" key={`${index}:${step.edgeId}`} onClick={() => legacyStep(step.edgeId)}>{index + 1}. {labels[index] ?? step.edgeId} · {step.direction} · INSPECT EVIDENCE</button>) : <p>No proven narrow path: conservative selection is not a fabricated edge.</p>}
          <button className="evidence-button" onClick={() => onFocusTest(undefined)}>CLEAR PATH</button></section>}
        {delta && <section className="inspector-section"><h3>TOPOLOGY DELTA</h3><p>Nodes +{delta.nodes.added.length} / −{delta.nodes.removed.length} / ~{delta.nodes.changed.length}; edges +{delta.edges.added.length} / −{delta.edges.removed.length} / ~{delta.edges.changed.length}</p>
          <details><summary>Added nodes and edges</summary><ul>{deltaItems('nodes', 'after')}{deltaItems('edges', 'after')}</ul></details><details><summary>Removed nodes and edges (before snapshot)</summary><ul>{deltaItems('nodes', 'before')}{deltaItems('edges', 'before')}</ul></details></section>}
        <section className="inspector-section"><h3>DIAGNOSTICS · {graph.diagnostics.length}</h3><p>Unresolved targets are not proven edges. Unknown scope selects the full available catalogue; unknown external tests remain unknown.</p><details><summary>Show unresolved references</summary><ul>{graph.diagnostics.map(item => <li key={item.id}><b>{item.code}</b> · {item.message}{item.locator && 'path' in item.locator ? ` · ${item.locator.path}` : ''}</li>)}</ul></details></section>
      </>}
    </aside>
  </div>;
}
