import { readFileSync } from 'node:fs';
import { calculateImpact } from '../packages/impact-engine/src/index';
import type { ImpactGraph, TestMetadata } from '../packages/impact-engine/src/schema';

const changedEntityIds = process.argv.slice(2);
if (!changedEntityIds.length) {
  console.error('Usage: pnpm impact LoginButton [User ...]\nEntity IDs are listed in impact/graph.json. This analyzes explicit entity changes, not source edits yet.');
  process.exit(1);
}
const graph = JSON.parse(readFileSync('impact/graph.json', 'utf8')) as ImpactGraph;
const catalogue = JSON.parse(readFileSync('impact/catalogue.json', 'utf8')) as TestMetadata[];
console.log(JSON.stringify(calculateImpact({ diff: [], changedEntityIds, graph, catalogue, uncertaintyReasons: [] }), null, 2));
