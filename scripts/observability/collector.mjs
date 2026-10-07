import { createServer } from 'node:net';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const run = promisify(execFile);
export const image = 'otel/opentelemetry-collector-contrib:0.140.0@sha256:ffc818ee108d0b934fd14207fd87ff247c9b64f344ed349d0b66c166c18a2312';
export async function startCollector(directory) {
  const name = `impact-g7-${randomUUID()}`;
  const data = resolve(directory);
  mkdirSync(data, { recursive: true });
  const reservations = await Promise.all([4318, 13133].map(async () => { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server; }));
  const ports = reservations.map(server => server.address().port);
  await Promise.all(reservations.map(server => new Promise(resolveClose => server.close(resolveClose))));
  let created = false;
  const command = args => run('docker', args, { timeout: 180_000, maxBuffer: 1_000_000 });
  const close = async () => { if (created) { const logs = await command(['logs', name]).catch(() => ({ stdout: '', stderr: '' })); writeFileSync(resolve(data, 'collector.log'), logs.stdout + logs.stderr); await command(['rm', '-fv', name]); created = false; } };
  try {
    await command(['run', '-d', '--name', name, '--label', 'test-impact-lab.phase=G7', '--memory', '256m', '--cpus', '1',
      '-p', `127.0.0.1:${ports[0]}:4318`, '-p', `127.0.0.1:${ports[1]}:13133`, '--mount', `type=bind,src=${resolve('scripts/observability/collector.yaml')},dst=/etc/otelcol-contrib/config.yaml,readonly`,
      '--mount', `type=bind,src=${data},dst=/data`, image]);
    created = true;
    const port = async exposed => { const result = await command(['port', name, `${exposed}/tcp`]); const value = result.stdout.trim().split(':').at(-1); if (!/^\d+$/.test(value)) throw new Error('Collector port missing'); return value; };
    const endpoint = `http://127.0.0.1:${await port(4318)}/v1/traces`;
    const health = `http://127.0.0.1:${await port(13133)}`;
    async function ready() {
      const deadline = Date.now() + 30_000;
      while (true) {
        try { const response = await fetch(health, { signal: AbortSignal.timeout(700) }); if (response.ok) return; } catch { /* readiness probe */ }
        if (Date.now() > deadline) throw new Error('Collector readiness timeout');
        await new Promise(resolveWait => setTimeout(resolveWait, 100));
      }
    }
    await ready();
    return { name, endpoint, path: resolve(data, 'traces.jsonl'), close,
      async stop() { await command(['stop', '-t', '5', name]); },
      async restart() { await command(['start', name]); await ready(); } };
  } catch (error) {
    if (created) { const logs = await command(['logs', '--tail', '40', name]).catch(() => ({ stdout: '', stderr: '' })); console.error(logs.stdout, logs.stderr); }
    await close(); throw error;
  }
}
