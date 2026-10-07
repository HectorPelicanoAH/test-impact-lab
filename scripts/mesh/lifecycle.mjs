import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { versions, manifests } from './manifests.mjs';
import { materializeInventory } from '../inventory/materialize.mjs';
const run = promisify(execFile);
const root = process.cwd();
const kind = resolve('.impact-tools/mesh/kind'), istioctl = resolve(`.impact-tools/mesh/istio-${versions.istio}/bin/istioctl`);
const base = resolve('.impact-runs/mesh');
async function command(binary, args, directory, timeout = 240_000) {
  try { const result = await run(binary, args, { timeout, maxBuffer: 8_000_000 }); if (directory) writeFileSync(resolve(directory, 'commands.log'), `${binary} ${args.join(' ')}\n${result.stdout}${result.stderr}\n`, { flag: 'a' }); return result.stdout; }
  catch (error) { if (directory) writeFileSync(resolve(directory, 'commands.log'), `${binary} ${args.join(' ')}\n${error.stdout ?? ''}${error.stderr ?? ''}\n`, { flag: 'a' }); throw error; }
}
export function readState(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Select an owned mesh profile ID');
  const directory = resolve(base, id);
  if (realpathSync(directory) !== directory) throw new Error('Mesh state must not be symlinked');
  const state = JSON.parse(readFileSync(resolve(directory, 'state.json'), 'utf8'));
  if (state.id !== id || state.directory !== directory || state.cluster !== `impact-g8-${id.slice(0, 8)}` || state.kubeconfig !== resolve(directory, 'kubeconfig')) throw new Error('Mesh ownership metadata mismatch');
  return state;
}
function save(state) { writeFileSync(resolve(state.directory, 'state.json'), JSON.stringify(state, null, 2)); }
export async function assertOwned(state) {
  readState(state.id);
  const label = (await command('docker', ['inspect', `${state.cluster}-control-plane`, '--format', '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'], state.directory)).trim();
  if (label !== state.cluster) throw new Error('Refusing to operate on a foreign cluster');
  const config = JSON.parse(await command('kubectl', ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.cluster}`, 'config', 'view', '-o', 'json'], undefined));
  const context = config.contexts?.find(item => item.name === `kind-${state.cluster}`);
  const server = config.clusters?.find(item => item.name === context?.context.cluster)?.cluster.server;
  if (!context || !/^https:\/\/127\.0\.0\.1:\d+$/.test(server) || (state.server && state.server !== server)) throw new Error('Kubeconfig does not address the owned local cluster');
  return server;
}
export async function kubectl(state, args, timeout = 240_000) {
  await assertOwned(state);
  return command('kubectl', ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.cluster}`, ...args], state.directory, timeout);
}
export async function up(revision) {
  if (!existsSync(kind) || !existsSync(istioctl)) throw new Error('Run pnpm mesh:setup first');
  const client = JSON.parse(await command('kubectl', ['version', '--client', '-o', 'json'])).clientVersion;
  if (Number(client.major) !== 1 || ![34, 35, 36].includes(Number.parseInt(client.minor))) throw new Error('Kubernetes 1.35 profile requires kubectl 1.34–1.36');
  const info = JSON.parse(await command('docker', ['info', '--format', '{"memory":{{.MemTotal}},"cpus":{{.NCPU}}}']));
  if (info.memory < 6 * 1024 ** 3 || info.cpus < 4) throw new Error('Mesh profile requires Docker with at least 6 GiB RAM and 4 CPUs');
  const id = randomUUID(), directory = resolve(base, id); mkdirSync(directory, { recursive: true });
  const inventory = materializeInventory();
  const state = { id, directory, cluster: `impact-g8-${id.slice(0, 8)}`, kubeconfig: resolve(directory, 'kubeconfig'), inventoryRoot: inventory.root, inventoryRevision: inventory.revision,
    revision, appImage: `impact-g8-app:${id}`, inventoryImage: `impact-g8-inventory:${id}`, phase: 'creating', versions };
  save(state); console.log(`G8 owned profile ${id}; state ${directory}`);
  try {
    const clusters = (await command(kind, ['get', 'clusters'], directory)).trim().split('\n');
    if (clusters.includes(state.cluster)) { state.phase = 'foreign-name-collision'; save(state); throw new Error('Generated cluster name already exists; refusing to use or delete it'); }
    console.log('G8 building local service images…');
    await command(process.execPath, ['scripts/build.mjs'], directory);
    await command('docker', ['build', '--build-arg', `RUNTIME_IMAGE=${versions.runtimeImage}`, '-f', 'scripts/mesh/App.Dockerfile', '-t', state.appImage, '.'], directory);
    await command('docker', ['build', '--build-arg', `RUNTIME_IMAGE=${versions.runtimeImage}`, '-f', resolve('scripts/mesh/Inventory.Dockerfile'), '-t', state.inventoryImage, inventory.root], directory);
    console.log('G8 creating isolated Kubernetes…');
    const config = { kind: 'Cluster', apiVersion: 'kind.x-k8s.io/v1alpha4', networking: { apiServerAddress: '127.0.0.1' }, nodes: [{ role: 'control-plane' }] };
    writeFileSync(resolve(directory, 'kind.json'), JSON.stringify(config));
    await command(kind, ['create', 'cluster', '--name', state.cluster, '--kubeconfig', state.kubeconfig, '--image', versions.nodeImage, '--config', resolve(directory, 'kind.json'), '--wait', '180s'], directory, 300_000);
    state.server = await assertOwned(state); save(state);
    console.log('G8 installing Istio, Prometheus and Kiali…');
    await command(istioctl, ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.cluster}`, 'install', '-y', '--set', 'profile=minimal', '--set', 'values.pilot.resources.requests.cpu=100m', '--set', 'values.pilot.resources.requests.memory=128Mi', '--set', 'meshConfig.accessLogFile=/dev/stdout'], directory, 300_000);
    await kubectl(state, ['apply', '-f', resolve('scripts/mesh/addons/prometheus.yaml'), '-f', resolve('scripts/mesh/addons/kiali.yaml')]);
    await command(kind, ['load', 'docker-image', '--name', state.cluster, state.appImage, state.inventoryImage], directory);
    writeFileSync(resolve(directory, 'manifests.json'), JSON.stringify(manifests(state), null, 2));
    await kubectl(state, ['apply', '-f', resolve(directory, 'manifests.json')]);
    await kubectl(state, ['wait', '--for=condition=Available', 'deployment', '--all', '-n', versions.namespace, '--timeout=240s'], 260_000);
    await kubectl(state, ['wait', '--for=condition=Available', 'deployment/kiali', 'deployment/prometheus', '-n', 'istio-system', '--timeout=240s'], 260_000);
    state.phase = 'ready'; save(state); console.log(`G8 ready. Profile ID: ${id}`); return state;
  } catch (error) {
    if (state.phase === 'foreign-name-collision') {
      rmSync(inventory.root, { recursive: true, force: true }); throw error;
    }
    state.phase = 'failed'; save(state);
    for (const args of [['get', 'pods', '-n', versions.namespace, '-o', 'wide'], ['describe', 'pods', '-n', versions.namespace], ['logs', '-n', versions.namespace, '-l', 'impact-lab-owner=' + id, '--all-containers', '--prefix', '--tail=60', '--max-log-requests=20']]) {
      await kubectl(state, args, 30_000).catch(() => {});
    }
    await down(state).catch(cleanupError => console.error('G8 cleanup failed:', cleanupError.message)); throw error;
  }
}
export async function down(state) {
  readState(state.id);
  if (state.phase === 'foreign-name-collision') throw new Error('Refusing to clean up a pre-existing cluster name');
  const nodes = (await command(kind, ['get', 'nodes', '--name', state.cluster], state.directory)).trim();
  if (nodes) {
    // Deletion must also work when creation failed before kind wrote a kubeconfig.
    const label = (await command('docker', ['inspect', `${state.cluster}-control-plane`, '--format', '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'], state.directory)).trim();
    if (label !== state.cluster) throw new Error('Refusing to delete a foreign cluster');
    if (state.server) await assertOwned(state);
    await command(kind, ['delete', 'cluster', '--name', state.cluster, '--kubeconfig', state.kubeconfig], state.directory);
  }
  for (const image of [state.appImage, state.inventoryImage]) await command('docker', ['image', 'rm', image], state.directory).catch(() => {});
  if (state.inventoryRoot && existsSync(state.inventoryRoot)) {
    // Only the temporary independent source created by this profile, never INVENTORY_ROOT from the user.
    const canonical = realpathSync(state.inventoryRoot);
    if (canonical !== state.inventoryRoot || dirname(canonical) !== realpathSync(tmpdir()) || !/^impact-external-inventory-[a-zA-Z0-9]{6}$/.test(basename(canonical))) throw new Error('Refusing to delete non-owned inventory source');
    rmSync(state.inventoryRoot, { recursive: true, force: true });
  }
  state.phase = 'removed'; save(state); console.log(`G8 removed owned cluster ${state.cluster}; evidence retained in ${state.directory}`);
}
export async function forward(state, service, namespace, remotePort) {
  if (!['impact-g8', 'istio-system'].includes(namespace) || !['frontend', 'prometheus', 'kiali'].includes(service)) throw new Error('Unknown profile forwarding target');
  await assertOwned(state);
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const port = reservation.address().port;
  await new Promise(resolveClose => reservation.close(resolveClose));
  const child = spawn('kubectl', ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.cluster}`, '-n', namespace, 'port-forward', '--address', '127.0.0.1', `service/${service}`, `${port}:${remotePort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; });
  const deadline = Date.now() + 15_000;
  while (!output.includes('Forwarding from')) { if (child.exitCode !== null || Date.now() > deadline) { child.kill('SIGTERM'); throw new Error(`Forwarding failed: ${output}`); } await new Promise(resolveWait => setTimeout(resolveWait, 100)); }
  return { origin: `http://127.0.0.1:${port}`, async close() { if (child.exitCode !== null) return; const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } };
}
