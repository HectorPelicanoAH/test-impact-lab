import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';

const run = promisify(execFile);
export const image = 'rabbitmq:4.2.0-management@sha256:6431bbd0f22df99ace800138399367d7d6181442dfff09feb2795e15d4bd4b7a';
function ready(port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    socket.setTimeout(1_000);
    socket.once('connect', () => socket.write(Buffer.from([65, 77, 81, 80, 0, 0, 9, 1])));
    socket.once('data', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(new Error('AMQP handshake not ready')); });
    socket.once('end', () => { socket.destroy(); reject(new Error('AMQP closed before handshake')); });
  });
}
export async function startBroker() {
  const name = `impact-g5-${randomUUID()}`;
  let created = false;
  const command = (args) => run('docker', args, { timeout: 180_000, maxBuffer: 1_000_000 });
  const close = async () => { if (created) { await command(['rm', '-fv', name]); created = false; } };
  try {
    await command(['info', '--format', '{{.ServerVersion}}']);
    await command(['run', '-d', '--name', name, '--label', 'test-impact-lab.phase=G5', '--memory', '768m', '--cpus', '2',
      '-p', '127.0.0.1::5672', '-e', 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2 +A 4', '-e', 'RABBITMQ_CTL_ERL_ARGS=+S 1:1 +A 1',
      '-e', 'RABBITMQ_DEFAULT_USER=impact', '-e', 'RABBITMQ_DEFAULT_PASS=impact-local-demo', image]);
    created = true;
    const { stdout } = await command(['port', name, '5672/tcp']);
    const port = stdout.trim().split(':').at(-1);
    if (!/^\d+$/.test(port)) throw new Error('Could not locate local broker port');
    const deadline = Date.now() + 60_000;
    while (true) {
      try { await ready(port); break; }
      catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 200)); // readiness probe, not a blind startup sleep
      }
    }
    return { name, url: `amqp://impact:impact-local-demo@127.0.0.1:${port}`, close,
      async stop() { await command(['stop', '-t', '10', name]); },
      async restart() { await command(['start', name]); } };
  } catch (error) {
    if (created) { const logs = await command(['logs', '--tail', '40', name]).catch(() => ({ stdout: '', stderr: '' })); console.error(logs.stdout, logs.stderr); }
    await close(); throw error;
  }
}