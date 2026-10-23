import { createHash } from 'node:crypto';

export const FORMAT = 'test-impact-view/1';
export const evidenceKinds = ['static', 'configuration', 'measured-coverage', 'observation', 'declaration'];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Extracted from the lab's graph/core.ts. Arrays representing sets are ordered
// explicitly below; canonical JSON alone cannot infer their semantics.
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Noncanonical value.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ' + label + '.');
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + label + '.');
}
function items(value, label) {
  if (!Array.isArray(value)) throw new Error('Invalid ' + label + ' array.');
  const ids = new Set();
  for (const item of value) {
    record(item, label);
    text(item.id, label + ' ID');
    if (ids.has(item.id)) throw new Error('Duplicate ' + label + ' ID: ' + item.id);
    ids.add(item.id);
  }
  return ids;
}

export function normalizeSnapshot(input) {
  record(input, 'snapshot');
  if (input.format !== FORMAT) throw new Error('Unsupported view format: ' + input.format);
  record(input.metadata, 'metadata');
  text(input.metadata.title, 'title');
  const nodes = items(input.nodes, 'node');
  const evidence = items(input.evidence, 'evidence');
  items(input.edges, 'edge');
  items(input.diagnostics, 'diagnostic');
  for (const node of input.nodes) {
    text(node.kind, 'node kind');
    text(node.label, 'node label');
    if (node.locations !== undefined && !Array.isArray(node.locations)) throw new Error('Invalid locations.');
  }
  for (const item of input.evidence) {
    if (!evidenceKinds.includes(item.kind)) throw new Error('Unsupported evidence kind: ' + item.kind);
  }
  for (const edge of input.edges) {
    text(edge.type, 'edge type');
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error('Dangling edge: ' + edge.id);
    if (!Array.isArray(edge.evidenceIds) || !edge.evidenceIds.length
      || edge.evidenceIds.some(id => !evidence.has(id))) throw new Error('Missing edge evidence: ' + edge.id);
  }
  const order = values => [...values].sort((a, b) => compare(a.id, b.id));
  const snapshot = {
    format: FORMAT,
    metadata: input.metadata,
    nodes: order(input.nodes).map(node => ({
      ...node,
      ...(node.locations ? { locations: [...node.locations].sort((a, b) => compare(canonical(a), canonical(b))) } : {})
    })),
    edges: order(input.edges).map(edge => ({ ...edge, evidenceIds: [...new Set(edge.evidenceIds)].sort() })),
    evidence: order(input.evidence),
    diagnostics: order(input.diagnostics),
    sources: input.sources ?? {}
  };
  record(snapshot.sources, 'sources');
  for (const [path, content] of Object.entries(snapshot.sources)) {
    if (typeof content !== 'string') throw new Error('Invalid source content: ' + path);
  }
  const id = hash(snapshot);
  if (input.id !== undefined && input.id !== id) throw new Error('Snapshot content hash mismatch.');
  return { ...snapshot, id };
}

export function createIndex(input) {
  const snapshot = normalizeSnapshot(input);
  const nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
  const evidence = new Map(snapshot.evidence.map(item => [item.id, item]));
  const incoming = new Map(), outgoing = new Map();
  for (const edge of snapshot.edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    incoming.get(edge.to).push(edge);
    outgoing.get(edge.from).push(edge);
  }
  return { snapshot, nodes, evidence, incoming, outgoing };
}

export function groupOf(node) {
  return node.group || node.attributes?.package || node.repositoryId || 'Ungrouped';
}

export function queryGraph(index, options = {}) {
  const { snapshot } = index;
  const query = String(options.q ?? '').toLowerCase();
  const hasEdgeFilter = Boolean(options.relation || options.evidence);
  const edges = snapshot.edges.filter(edge => (!options.relation || edge.type === options.relation)
    && (!options.evidence || edge.evidenceIds.some(id => index.evidence.get(id).kind === options.evidence)));
  const endpoints = new Set(edges.flatMap(edge => [edge.from, edge.to]));
  const matches = snapshot.nodes.filter(node => (!options.kind || node.kind === options.kind)
    && (!options.group || groupOf(node) === options.group)
    && (!query || [node.id, node.label, groupOf(node), ...(node.locations ?? []).map(location => location.path ?? '')].join(' ').toLowerCase().includes(query))
    && (!hasEdgeFilter || endpoints.has(node.id)));
  const offset = Math.max(0, Math.trunc(Number(options.offset) || 0));
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(options.limit) || 80)));
  const visible = matches.slice(offset, offset + limit);
  const ids = new Set(visible.map(node => node.id));
  return {
    nodes: visible, edges: edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)),
    totalNodes: snapshot.nodes.length, matchedNodes: matches.length,
    offset, limit, hiddenNodes: snapshot.nodes.length - visible.length
  };
}

export function summary(index) {
  const { snapshot } = index;
  const unique = values => [...new Set(values)].sort();
  return {
    id: snapshot.id, format: snapshot.format, metadata: snapshot.metadata,
    counts: { nodes: snapshot.nodes.length, edges: snapshot.edges.length, evidence: snapshot.evidence.length, diagnostics: snapshot.diagnostics.length },
    filters: {
      kinds: unique(snapshot.nodes.map(node => node.kind)),
      groups: unique(snapshot.nodes.map(groupOf)),
      relations: unique(snapshot.edges.map(edge => edge.type)),
      evidence: unique(snapshot.evidence.map(item => item.kind))
    },
    coverage: { status: 'not-computed', reason: 'A graph viewer cannot certify measurement completeness or a coverage denominator.' }
  };
}
