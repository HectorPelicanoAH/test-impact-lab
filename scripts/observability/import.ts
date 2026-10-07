import { readFileSync, writeFileSync } from 'node:fs';
import { readCollector } from '../graph/observations';
import { canonical, hash } from '../graph/core';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: pnpm observations:import <collector.jsonl> <dataset.json>');
const dataset = readCollector(readFileSync(input, 'utf8'));
writeFileSync(output, `${canonical(dataset)}\n`, { flag: 'wx' });
console.log(`Archived ${dataset.spans.length} spans; dataset SHA-256 ${hash(dataset)}`);
