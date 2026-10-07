import type { EdgeKind, EdgeV2, GraphSnapshotV2, NodeV2 } from '../../../packages/impact-engine/src/schema-v2';
import type { ProgressEvent } from '../../../scripts/graph/progress';
import type { JourneyId } from './journeys';

export const relationLabels: Record<EdgeKind, string> = { imports: 'importa', calls: 'llama', renders: 'renderiza', routes: 'enruta', implements: 'implementa', 'invokes-endpoint': 'invoca HTTP', publishes: 'publica', subscribes: 'se suscribe', processes: 'procesa', exercises: 'ejercita', contains: 'contiene', realizes: 'registra handler', injects: 'inyecta', exposes: 'expone' };
export const nodeLabels: Record<NodeV2['kind'], string> = { file: 'Archivo', symbol: 'Símbolo', screen: 'Pantalla', route: 'Ruta', service: 'Servicio declarado', endpoint: 'Endpoint', 'http-contract': 'Contrato HTTP', 'event-schema': 'Esquema de evento', channel: 'Canal', subscription: 'Suscripción / cola', consumer: 'Consumidor', 'broker-resource': 'Recurso de broker', test: 'Test', 'reviewed-anchor': 'Arquitectura revisada' };

/** Selects actual facts for presentation. It neither invents edges nor changes the authoritative graph. */
export function guidedFacts(graph: GraphSnapshotV2, event: ProgressEvent | undefined, journey: JourneyId, focusEdge?: string, pathEdges: string[] = []) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const available = event ? new Set(event.edgeIds) : new Set(graph.edges.map(edge => edge.id));
  const edges = graph.edges.filter(edge => available.has(edge.id));
  let chosen: EdgeV2[] = [], scope = 'Relaciones del journey';
  const auditCode = journey === 'consumer' && event?.phase === 'typescript'
    ? graph.nodes.find(node => node.kind === 'symbol' && node.label === 'audit' && event.nodeIds.includes(node.id)
      && node.locations.some(location => location.path.endsWith('/AuditConsumer.ts'))) : undefined;
  const focused = focusEdge && graph.edges.find(edge => edge.id === focusEdge);
  if (focused) { chosen = [focused]; scope = 'Relación seleccionada'; }
  else if (pathEdges.length) { chosen = edges.filter(edge => pathEdges.includes(edge.id) || pathEdges.includes(String(edge.qualifiers.legacyId ?? ''))); scope = 'Camino causal del test'; }
  else if (auditCode) {
    chosen = edges.filter(edge => edge.type !== 'contains' && [edge.from, edge.to].some(id => nodes.get(id)?.locations.some(location => location.path.endsWith('/AuditConsumer.ts')))).slice(0, 3);
    scope = 'Código descubierto del nuevo consumidor';
  }
  else if (['consumer', 'event', 'retry'].includes(journey)) {
    const consumerName = journey === 'consumer' && graph.nodes.some(node => node.kind === 'consumer' && node.label === 'audit') ? 'audit' : 'notifications';
    const consumer = graph.nodes.find(node => node.kind === 'consumer' && node.label === consumerName);
    const queue = graph.nodes.find(node => node.kind === 'subscription' && node.attributes.subscription === consumerName);
    const channels = new Set(graph.nodes.filter(node => node.kind === 'channel').map(node => node.id));
    chosen = edges.filter(edge => edge.type === 'publishes' && channels.has(edge.to)
      || edge.type === 'implements' && channels.has(edge.from)
      || edge.type === 'subscribes' && edge.from === queue?.id
      || edge.type === 'processes' && edge.from === consumer?.id
      || edge.type === 'realizes' && edge.to === consumer?.id);
  } else if (['http', 'unresolved'].includes(journey)) {
    const endpoints = new Set(graph.nodes.filter(node => node.kind === 'endpoint' && node.attributes.service === 'inventory').map(node => node.id));
    chosen = edges.filter(edge => edge.type === 'invokes-endpoint' && endpoints.has(edge.to)
      || ['implements', 'exposes'].includes(edge.type) && endpoints.has(edge.from));
  } else {
    chosen = edges.filter(edge => edge.type === 'renders' && [edge.from, edge.to].some(id => nodes.get(id)?.locations.some(location => /LoginPage|GuidedScreen/.test(location.path))));
  }
  // Before adapters run, show a small, explicitly labelled sample from this phase's real evidence.
  if (!chosen.length && !focused && !pathEdges.length && !auditCode) {
    const proofs = new Set(event?.evidenceIds ?? []);
    const paths = journey === 'screen' ? /LoginPage|GuidedScreen/ : ['http', 'unresolved'].includes(journey) ? /InventoryClient|external\/inventory/ : /AuditConsumer|notifications|OutboxPublisher|messaging/;
    const relevant = edges.filter(edge => edge.type !== 'contains' && edge.evidenceIds.some(id => proofs.has(id))
      && [edge.from, edge.to].some(id => nodes.get(id)?.locations.some(location => paths.test(location.path))));
    chosen = (relevant.length ? relevant : edges.filter(edge => edge.type !== 'contains' && edge.evidenceIds.some(id => proofs.has(id)))).slice(0, 5);
    scope = 'Ejemplos verificados de esta fase';
  }
  const ids = new Set(chosen.flatMap(edge => [edge.from, edge.to]));
  if (auditCode && !focused && !pathEdges.length) ids.add(auditCode.id);
  const items = graph.nodes.filter(node => ids.has(node.id));
  return { nodes: items, edges: chosen, scope };
}

/** Dependency-oriented layers; cycles retain a finite stable position. */
export function layoutFacts(nodes: NodeV2[], edges: EdgeV2[]) {
  const rank = new Map(nodes.map(node => [node.id, 0]));
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const queue = nodes.filter(node => !incoming.get(node.id)).map(node => node.id).sort();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const edge of edges.filter(edge => edge.from === id)) {
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, (rank.get(id) ?? 0) + 1));
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (incoming.get(edge.to) === 0) queue.push(edge.to);
    }
  }
  // Bring a single-edge root (for example the publisher) next to its dependency,
  // keeping a long arrow from running through the handler/consumer chain.
  for (const node of nodes) {
    const outgoing = edges.filter(edge => edge.from === node.id);
    if (!edges.some(edge => edge.to === node.id) && outgoing.length === 1) {
      rank.set(node.id, Math.max(rank.get(node.id) ?? 0, (rank.get(outgoing[0]!.to) ?? 0) - 1));
    }
  }
  const rows = new Map<number, number>();
  return nodes.map(node => { const column = rank.get(node.id) ?? 0, row = rows.get(column) ?? 0; rows.set(column, row + 1);
    return { id: node.id, position: { x: column * 235, y: row * 120 } }; });
}
