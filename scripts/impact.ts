import { calculateImpact } from '../packages/impact-engine/src/index';
import { buildArchive, compatibilityGraph, loadWorkspace } from './graph/snapshot';

const changedEntityIds = process.argv.slice(2);
if (!changedEntityIds.length) {
  console.error('Usage: pnpm impact LoginButton [User ...]\nEntity IDs are listed in impact/graph.json. This analyzes explicit entity changes, not source edits yet.');
  process.exit(1);
}
const archive = buildArchive(loadWorkspace(process.cwd()));
const graph = compatibilityGraph(archive), catalogue = archive.catalogue;
const uncertaintyReasons = changedEntityIds.some(id => !archive.legacyGraph.nodes.some(node => node.id === id))
  || archive.graph.diagnostics.some(item => item.code === 'legacy-unverified' || item.code === 'parse-failed')
  ? ['No proven reviewed compatibility scope; selecting full available catalogue. Use the explorer for before/after source analysis.'] : [];
console.log(JSON.stringify(calculateImpact({ diff: [], changedEntityIds, graph, catalogue, uncertaintyReasons }), null, 2));
