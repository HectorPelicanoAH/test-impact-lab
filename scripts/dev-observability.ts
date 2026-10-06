import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startCollector } from './observability/collector.mjs';
import { buildArchive, loadWorkspace } from './graph/snapshot';
const revision = buildArchive(loadWorkspace(process.cwd(), '')).graph.repositories[0]!.revision;
const directory = resolve('.impact-data', 'observability', randomUUID());
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'traces.jsonl'), '');
const collector = await startCollector(directory);
console.log(`G7 Collector ${collector.name}; archived traces retained at ${collector.path}`);
const child = spawn(process.execPath, ['scripts/dev-events.mjs'], { stdio: 'inherit', env: { ...process.env,
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector.endpoint, OTEL_CODE_REVISION: revision, VITE_OTEL_CODE_REVISION: revision, OTEL_COLLECTOR_PATH: collector.path } });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); void collector.close(); process.exitCode = 1; });
child.on('close', code => { void collector.close().finally(() => { process.exitCode = code ?? 1; }); });
