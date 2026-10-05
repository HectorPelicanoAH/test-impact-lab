import { useMemo } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DemoAnalysis, DemoSnapshot } from '../types';

const layerOrder = ['e2e', 'component', 'frontend-unit', 'UI', 'UI composition', 'UI behavior', 'UI validation', 'Frontend application', 'Frontend validation', 'API client', 'API contract', 'Primary adapter', 'HTTP transport', 'HTTP transport behavior', 'Application', 'Application behavior', 'Domain', 'Domain behavior', 'Domain invariant', 'Domain identity', 'Port', 'Secondary adapter', 'integration', 'backend-unit'];

export function ImpactGraph({ snapshot, analysis, focusTest, onFocusTest }: {
  snapshot: DemoSnapshot; analysis?: DemoAnalysis; focusTest?: string; onFocusTest: (id?: string) => void;
}) {
  const result = analysis?.result;
  const focusReason = result?.explanations.find(reason => reason.testId === focusTest);
  const focusEdges = new Set(focusReason?.path.map(step => step.edgeId) ?? []);
  const selected = new Set(result?.selectedTests ?? []);
  const changed = new Set(result?.changedEntities ?? []);
  const affected = new Set(result?.affectedNodes ?? []);
  const journey = new Set(result?.journeyNodes ?? []);
  const { nodes, edges } = useMemo(() => {
    const buckets = new Map<string, number>();
    const graphNodes: Node[] = snapshot.graph.nodes.map(item => {
      const layer = item.layer;
      const x = Math.max(0, layerOrder.indexOf(layer)) * 230;
      const row = buckets.get(layer) ?? 0;
      buckets.set(layer, row + 1);
      const isSelected = Boolean(item.testId && selected.has(item.testId));
      const state = changed.has(item.id) ? 'changed' : isSelected ? 'selected' : affected.has(item.id) ? 'affected' : journey.has(item.id) ? 'journey' : 'muted';
      return {
        id: item.id,
        position: { x, y: row * 78 },
        data: { label: <div className="flow-label"><small>{layer}</small><span>{item.testId ? `${item.testId} · ` : ''}{item.label}</span></div> },
        className: `flow-node ${state} ${item.kind === 'contract' ? 'contract' : ''}`,
        style: { width: 200 },
      };
    });
    const graphEdges: Edge[] = snapshot.graph.edges.map(edge => ({
      id: edge.id, source: edge.from, target: edge.to, markerEnd: { type: MarkerType.ArrowClosed },
      label: edge.type,
      className: focusEdges.has(edge.id) ? 'flow-edge focused' : 'flow-edge',
      animated: focusEdges.has(edge.id),
      data: edge.evidence,
    }));
    return { nodes: graphNodes, edges: graphEdges };
  }, [snapshot, analysis, focusTest]);
  return <div className="graph-shell">
    <div className="graph-toolbar"><div><b>IMPACT GRAPH</b><span>{snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} evidenced edges</span></div>{focusTest && <button onClick={() => onFocusTest(undefined)}>Clear path · {focusTest}</button>}</div>
    <div className="graph-legend" aria-label="Graph legend"><span className="changed">Changed source</span><span className="affected">Affected code</span><span className="journey">Contract journey</span><span className="selected">Selected test</span><span className="boundary">Double border = contract</span></div>
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.08} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false}
      onNodeClick={(_event, node) => { const testId = snapshot.graph.nodes.find(item => item.id === node.id)?.testId; if (testId) onFocusTest(testId); }}>
      <Background color="#263044" gap={22} size={1} /><MiniMap pannable zoomable nodeStrokeWidth={2} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
