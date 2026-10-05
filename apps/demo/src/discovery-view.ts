import type { EdgeKind, EdgeV2, EvidenceV2, GraphSnapshotV2, NodeV2, SnapshotDeltaV2 } from '../../../packages/impact-engine/src/schema-v2';

export type RevisionSide = 'before' | 'after';
export type DeltaStatus = 'added' | 'removed' | 'changed' | 'unchanged';
export type Scope = 'all' | string;
export type SourceKind = EvidenceV2['kind'] | 'all';

export function graphForSide(before: GraphSnapshotV2, after: GraphSnapshotV2 | undefined, side: RevisionSide) {
  return side === 'after' && after ? after : before;
}
export function changeStatus(id: string, kind: 'nodes' | 'edges', side: RevisionSide, delta?: SnapshotDeltaV2): DeltaStatus {
  if (!delta) return 'unchanged';
  if (side === 'after' && delta[kind].added.some(item => item.id === id)) return 'added';
  if (side === 'before' && delta[kind].removed.some(item => item.id === id)) return 'removed';
  if (delta[kind].changed.some(item => item.id === id)) return 'changed';
  return 'unchanged';
}
export function sourceArea(node: NodeV2, roots: string[]): string {
  if (node.kind === 'test') return 'Other / tests';
  const path = node.locations[0]?.path ?? (typeof node.attributes.path === 'string' ? node.attributes.path : undefined);
  if (!path && node.productId === 'inventory' && node.repositoryId === 'external-inventory') return roots.find(root => root.startsWith('external/inventory/')) ?? 'Other / inventory contract';
  return roots.find(root => path?.startsWith(`${root}/`)) ?? 'Other / tests';
}
export function visibleGraph(graph: GraphSnapshotV2, roots: string[], scope: Scope, type: EdgeKind | 'all', sourceKind: SourceKind) {
  const evidence = new Map(graph.evidence.map(item => [item.id, item]));
  const nodes = graph.nodes.filter(node => scope === 'all' || sourceArea(node, roots) === scope);
  const allowed = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => allowed.has(edge.from) && allowed.has(edge.to)
    && (type === 'all' || edge.type === type)
    && (sourceKind === 'all' || edge.evidenceIds.some(id => evidence.get(id)?.kind === sourceKind)));
  return { nodes, edges };
}
export function neighborhood(graph: GraphSnapshotV2, id: string) {
  return { dependencies: graph.edges.filter(edge => edge.from === id), consumers: graph.edges.filter(edge => edge.to === id) };
}
export function relatedLegacyEdge(graph: GraphSnapshotV2, legacyId: string): EdgeV2 | undefined {
  return graph.edges.find(edge => edge.qualifiers.legacyId === legacyId);
}
