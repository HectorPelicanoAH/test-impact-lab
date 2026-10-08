import type { DiscoveryArchive, GraphSnapshotV2, NodeV2, OverlayEdit } from './schema-v2';

export function nodeSourcePaths(node: NodeV2): string[] {
  return [...new Set([...node.locations.map(item => item.path), ...(typeof node.attributes.path === 'string' ? [node.attributes.path] : [])])];
}

function validObject(text: string): boolean {
  try { const value: unknown = JSON.parse(text); return value !== null && typeof value === 'object' && !Array.isArray(value); }
  catch { return false; }
}

/** A declared event contract break stays within its previous, proven binding. A failed
 * extraction of arbitrary code does not receive this exemption. */
export function boundedContractDiagnostic(before: DiscoveryArchive, edits: OverlayEdit[], item: GraphSnapshotV2['diagnostics'][number]): boolean {
  if (item.code !== 'missing-contract' || !item.locator || !('path' in item.locator)) return false;
  const diagnosticPath = item.locator.path;
  const contracts = before.graph.nodes.filter(node => node.kind === 'event-schema'
    && edits.some(edit => edit.operation !== 'delete' && nodeSourcePaths(node).includes(edit.path)
      && validObject(edit.content)));
  return contracts.some(contract => nodeSourcePaths(contract).includes(diagnosticPath)
    || before.graph.edges.some(edge => (edge.from === contract.id || edge.to === contract.id)
      && edge.evidenceIds.some(id => {
        const proof = before.graph.evidence.find(proof => proof.id === id);
        return proof && 'path' in proof.locator && proof.locator.path === diagnosticPath && proof.resolution === 'resolved';
      })));
}

/** New code must have an incoming, proven dependency from pre-existing code;
 * an isolated file has no demonstrated test scope. */
export function connectedAddition(before: DiscoveryArchive, after: DiscoveryArchive, path: string): boolean {
  const added = new Set(after.graph.nodes.filter(node => node.kind !== 'file' && nodeSourcePaths(node).includes(path)).map(node => node.id));
  return after.graph.edges.some(edge => ['imports', 'renders', 'calls', 'routes', 'realizes'].includes(edge.type)
    && added.has(edge.to) && !added.has(edge.from) && before.graph.nodes.some(node => node.id === edge.from)
    && edge.evidenceIds.some(id => after.graph.evidence.some(proof => proof.id === id && proof.resolution === 'resolved')));
}
