import { useState } from 'react';
import type { GraphSnapshotV2 } from '../../../../packages/impact-engine/src/schema-v2';

export function ObservedTraces({ graph, onNode }: { graph: GraphSnapshotV2; onNode: (id: string) => void }) {
  const [chosen, setChosen] = useState('');
  const traceIds = [...new Set(graph.observations.flatMap(item => item.span ? [item.span.traceId] : []))].sort();
  const selected = traceIds.includes(chosen) ? chosen : traceIds[0];
  const observations = graph.observations.filter(item => item.span?.traceId === selected).sort((a, b) => Number(BigInt(a.span!.startTimeUnixNano) - BigInt(b.span!.startTimeUnixNano)) || a.id.localeCompare(b.id));
  return <section className="observed-traces" aria-label="Observed traces"><h2>Observed traces</h2>
    <p>Static dependencies remain available with no traffic. Observations describe these recorded requests; they do not establish test assertion coverage.</p>
    {!traceIds.length ? <p>No archived trace spans in this snapshot. Static impact analysis remains available.</p> : <>
      <label>Trace<select aria-label="Observed trace" value={selected} onChange={event => setChosen(event.target.value)}>{traceIds.map(id => <option key={id}>{id}</option>)}</select></label>
      <p>Dataset <code>{graph.inputs.observationsHash}</code> · {observations.length} recorded spans</p>
      <ol className="trace-spans">{observations.map(item => { const span = item.span!;
        const duration = Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1_000_000;
        return <li key={item.id}><details><summary>{item.serviceId} · {span.name} · {duration.toFixed(2)} ms · {span.status.code === 2 ? 'error' : 'no recorded error'} · {item.correlation.status}</summary>
          <p>Service version {item.serviceVersion} · {item.environment} · revision <code>{span.revision}</code></p>
          <p>{item.window.start} → {item.window.end}</p><p>Span {span.spanId} · parent {span.parentSpanId || 'root'}</p>
          {span.links.map(link => <p key={`${link.traceId}/${link.spanId}`}>Explicit link: {link.traceId}/{link.spanId}</p>)}
          <p>{item.correlation.reason}</p>{span.status.message && <p role="status">{span.status.message}</p>}
          <p>Message: {span.attributes['messaging.message.id'] ?? 'none'} · attempt: {span.attributes['messaging.delivery.attempt'] ?? 'none'}</p>
          {item.correlation.nodeIds.map(id => <button className="evidence-button" key={id} onClick={() => onNode(id)}>INSPECT ARCHIVED CODE · {graph.nodes.find(node => node.id === id)?.label}</button>)}
          <p>{item.correlation.edgeIds.length} existing logical dependencies; retries do not create extra edges.</p>
        </details></li>; })}</ol></>}
  </section>;
}
