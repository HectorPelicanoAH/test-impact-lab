import { useState } from 'react';
import type { GraphSnapshotV2 } from '../../../../packages/impact-engine/src/schema-v2';

export function MeshComparison({ graph, onNode }: { graph: GraphSnapshotV2; onNode: (id: string) => void }) {
  const [chosen, setChosen] = useState('');
  const mesh = graph.mesh;
  if (!mesh) return null;
  const capture = mesh.captures.find(item => item.id === chosen) ?? mesh.captures[0];
  return <section className="observed-traces mesh-comparison" aria-label="Service mesh comparison"><h2>Service mesh</h2>
    <p>Communication between workloads in a recorded window. No traffic does not remove a static dependency. TCP traffic to a broker cannot identify an event, subscription or consumer function.</p>
    <label>Window<select aria-label="Mesh window" value={capture?.id} onChange={event => setChosen(event.target.value)}>{mesh.captures.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
    <p>{capture?.window.start} → {capture?.window.end} · namespace {mesh.namespace}</p>
    <p>Dataset <code>{mesh.datasetHash}</code> · <a href={`/api/snapshots/${graph.id}/mesh`} target="_blank" rel="noreferrer">Inspect archived counters, workload versions and Kiali graph</a></p>
    <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Communication</th><th>Declared</th><th>Static</th><th>Observed</th><th>Correlation</th></tr></thead><tbody>
      {mesh.comparisons.filter(item => item.captureId === capture?.id).map(item => <tr key={`${item.protocol}/${item.from}/${item.to}/${item.sourceVersion}/${item.destinationVersion}`}>
        <td>{item.from} ({item.sourceVersion}) → {item.to} ({item.destinationVersion}) · {item.protocol}</td><td>{item.declared ? 'yes' : 'no'}</td><td>{item.staticEdgeIds.length ? `${item.staticEdgeIds.length} existing edges` : 'no matching edge'}</td><td>{item.observed ? `${item.measured} ${item.unit}` : 'not observed in this window'}</td>
        <td><details><summary>{item.correlation.status}</summary><p>{item.correlation.reason}</p>{item.correlation.nodeIds.map(id => <button key={id} onClick={() => onNode(id)}>INSPECT ARCHIVED CODE · {graph.nodes.find(node => node.id === id)?.label}</button>)}</details></td>
      </tr>)}
    </tbody></table></div>
  </section>;
}
