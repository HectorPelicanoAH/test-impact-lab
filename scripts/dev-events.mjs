import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBroker } from './messaging/broker.mjs';

const broker = await startBroker();
const ownedData = !process.env.DATA_DIR;
const data = process.env.DATA_DIR ?? mkdtempSync(join(tmpdir(), 'impact-g5-dev-'));
console.log(`G5 broker ${broker.name}; only this container is removed at shutdown.`);
console.log(`G5 data ${data}; ${ownedData ? 'temporary, removed with this session' : 'user-owned, retained'}.`);
const child = spawn(process.execPath, ['scripts/dev.mjs'], { stdio: 'inherit', env: { ...process.env, BROKER_URL: broker.url, G5_BROKER_CONTAINER: broker.name, DATA_DIR: data,
	NOTIFICATIONS_URL: process.env.NOTIFICATIONS_URL ?? `http://127.0.0.1:${process.env.NOTIFICATIONS_PORT ?? '3004'}`,
	PREPARATION_URL: process.env.PREPARATION_URL ?? `http://127.0.0.1:${process.env.PREPARATION_PORT ?? '3005'}` } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('close', code => { void broker.close().finally(() => { if (ownedData) rmSync(data, { recursive: true, force: true }); process.exitCode = code ?? 1; }); });
