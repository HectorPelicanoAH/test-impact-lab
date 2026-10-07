import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { up, down, readState, kubectl, forward } from './mesh/lifecycle.mjs';
import { buildArchive, loadWorkspace, validateArchive } from './graph/snapshot';
import { canonical } from './graph/core';
import { SnapshotStore, WorkspaceSnapshots } from './graph/store';
import { createDemoApi } from '../apps/demo/server';
import type { MeshBinding, MeshDataset, MeshSeries } from '../packages/impact-engine/src/schema-v2';

const id = process.argv[2];
const state = id ? readState(id) : await up(buildArchive(loadWorkspace(process.cwd(), '')).graph.repositories[0]!.revision);
const active: Awaited<ReturnType<typeof forward>>[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let api: ReturnType<typeof createDemoApi> | undefined;
let demo: ChildProcess | undefined;
async function until<T>(probe: () => Promise<T>, accept: (value: T) => boolean, timeout = 90_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (true) {
    const value = await probe(); if (accept(value)) return value;
    if (Date.now() > deadline) throw new Error('G8 timed out waiting for fresh service metrics/effects');
    await new Promise(done => setTimeout(done, 2_000));
  }
}
try {
  assert.equal(state.phase, 'ready');
  const platform = JSON.parse(await kubectl(state, ['version', '-o', 'json']));
  assert.equal(platform.serverVersion.gitVersion, `v${state.versions.kubernetes}`);
  const tooling = JSON.parse(await kubectl(state, ['get', 'deployments', '-n', 'istio-system', '-o', 'json']));
  for (const [name, image] of [['istiod', `istio/pilot:${state.versions.istio}`], ['kiali', `kiali/kiali:v${state.versions.kiali}`], ['prometheus', `prom/prometheus:v${state.versions.prometheus}`]]) {
    assert(tooling.items.find((item: any) => item.metadata.name === name)?.spec.template.spec.containers.some((item: any) => item.image.endsWith(image)), `Unexpected image for ${name}`);
  }
  writeFileSync(resolve(state.directory, 'platform.json'), canonical({ platform, tooling }));
  const input = loadWorkspace(process.cwd(), state.inventoryRoot), baseline = buildArchive(input);
  assert.equal(baseline.graph.repositories[0]!.revision, state.revision, 'Product code changed since deployment; recreate the profile');
  const resources = JSON.parse(await kubectl(state, ['get', 'pods', '-n', 'impact-g8', '-o', 'json'])) as { items: any[] };
  const deployment = JSON.parse(await kubectl(state, ['get', 'deployments', '-n', 'impact-g8', '-o', 'json'])) as { items: any[] };
  const bindings: MeshBinding[] = ['frontend', 'orders-api', 'inventory', 'notifications', 'preparation', 'rabbitmq'].map(service => {
    const pod = resources.items.find(item => item.metadata.labels.app === service);
    assert.equal(pod.metadata.labels['impact-lab-owner'], state.id);
    assert(pod.status.containerStatuses.every((item: any) => item.ready));
    const labels = pod.metadata.labels;
    const path = ({ frontend: 'apps/frontend/src/OrdersPage.tsx', 'orders-api': 'apps/backend/src/http.ts', inventory: 'external/inventory/src/server.ts', notifications: 'apps/notifications/src/main.ts', preparation: 'apps/preparation/src/main.ts' } as Record<string, string>)[service];
    const symbol = ({ frontend: 'OrdersPage', 'orders-api': 'createHttpServer', inventory: 'createInventoryServer', notifications: 'notify', preparation: 'prepare' } as Record<string, string>)[service];
    const node = baseline.graph.nodes.find(item => service === 'rabbitmq' ? item.kind === 'broker-resource' && item.label === 'local/orders-rabbitmq' : item.kind === 'symbol' && item.label === symbol && item.locations.some(location => location.path === path));
    assert(node, `Missing catalogue binding for ${service}`);
    const repo = baseline.graph.repositories.find(item => item.productId === node.productId && item.repositoryId === node.repositoryId)!;
    assert.equal(pod.metadata.annotations['impact-lab/revision'], repo.revision);
    return { service, workload: service, namespace: 'impact-g8', version: labels['service.istio.io/canonical-revision'], revision: repo.revision, productId: repo.productId, repositoryId: repo.repositoryId,
      selector: { kind: node.kind, label: node.label, ...(path ? { path } : {}) }, image: pod.status.containerStatuses.find((item: any) => item.name === 'app').imageID };
  });
  writeFileSync(resolve(state.directory, 'deployed-resources.json'), canonical({ pods: resources, deployments: deployment }));
  const web = await forward(state, 'frontend', 'impact-g8', 8080); active.push(web);
  const prom = await forward(state, 'prometheus', 'istio-system', 9090); active.push(prom);
  const kiali = await forward(state, 'kiali', 'istio-system', 20001); active.push(kiali);
  async function metrics(name: string): Promise<MeshSeries[]> {
    const response = await fetch(`${prom.origin}/api/v1/query?query=${encodeURIComponent(`${name}{reporter="source",source_workload_namespace="impact-g8"}`)}`, { signal: AbortSignal.timeout(5_000) });
    assert(response.ok); const body = await response.json() as { status: string; data: { result: MeshSeries[] } }; assert.equal(body.status, 'success'); return body.data.result;
  }
  async function counters() { return { http: await metrics('istio_requests_total'), tcp: await metrics('istio_tcp_sent_bytes_total') }; }
  const count = (series: MeshSeries[], from: string, to: string) => series.filter(item => item.metric.source_workload === from && item.metric.destination_workload === to).reduce((sum, item) => sum + Number(item.value[1]), 0);
  async function place() {
    const response = await fetch(`${web.origin}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'demo-widget', quantity: 1 }) });
    const body = await response.json() as { id: string }; assert.equal(response.status, 201, JSON.stringify(body)); return body.id;
  }
  async function processed(orderId: string) {
    for (const [service, port] of [['notifications', 3004], ['preparation', 3005]] as const) await until(async () => {
      const output = await kubectl(state, ['exec', `deployment/${service}`, '-n', 'impact-g8', '-c', 'app', '--', 'node', '--input-type=module', '-e', `console.log((await fetch('http://127.0.0.1:${port}/orders/${orderId}')).status)`]);
      return output.trim();
    }, value => value === '200');
  }
  console.log('G8 warmup and real consumer effects…');
  await processed(await place());
  await until(counters, value => count(value.http, 'frontend', 'orders-api') > 0 && count(value.http, 'orders-api', 'inventory') > 0 && value.tcp.length > 0);
  const before = await counters(), start = new Date().toISOString();
  const orders: string[] = [];
  for (let n = 0; n < 6; n++) orders.push(await place());
  await processed(orders.at(-1)!);
  const after = await until(counters, value => count(value.http, 'orders-api', 'inventory') - count(before.http, 'orders-api', 'inventory') >= 6
    && count(value.http, 'frontend', 'orders-api') - count(before.http, 'frontend', 'orders-api') >= 6);
  const firstEnd = new Date().toISOString();
  const readStart = new Date().toISOString();
  for (let n = 0; n < 6; n++) assert.equal((await fetch(`${web.origin}/api/orders/${orders[0]}`)).status, 200);
  const readAfter = await until(counters, value => count(value.http, 'frontend', 'orders-api') - count(after.http, 'frontend', 'orders-api') >= 6);
  const readEnd = new Date().toISOString();
  const graphResponse = await fetch(`${kiali.origin}/kiali/api/namespaces/graph?namespaces=impact-g8&graphType=workload&duration=600s&injectServiceNodes=false`, { signal: AbortSignal.timeout(15_000) });
  assert(graphResponse.ok, `Kiali graph ${graphResponse.status}: ${await graphResponse.clone().text()}`);
  const kialiGraph = await graphResponse.json();
  assert(Array.isArray(kialiGraph.elements?.edges) && kialiGraph.elements.edges.length > 0, 'Kiali must return actual traffic edges');
  const configuration = 'scripts/mesh/manifests.mjs';
  const declarations: MeshDataset['declarations'] = [
    { from: 'frontend', to: 'orders-api', protocol: 'http', configuration: 'scripts/mesh/frontend.mjs', reason: 'Frontend HTTP proxy destination' },
    ...['inventory', 'notifications', 'preparation'].map(to => ({ from: 'orders-api', to, protocol: 'http' as const, configuration, reason: `Deployment ${to.toUpperCase()}_URL` })),
    ...['orders-api', 'notifications', 'preparation'].map(from => ({ from, to: 'rabbitmq', protocol: 'tcp' as const, configuration, reason: 'Deployment BROKER_URL; transport only' })),
  ];
  const dataset: MeshDataset = { schemaVersion: 1, clusterId: state.cluster, namespace: 'impact-g8', bindings, declarations, versions: state.versions, kialiGraph,
    captures: [{ id: 'orders', window: { start, end: firstEnd }, httpBefore: before.http, httpAfter: after.http, tcpBefore: before.tcp, tcpAfter: after.tcp },
      { id: 'read-only', window: { start: readStart, end: readEnd }, httpBefore: after.http, httpAfter: readAfter.http, tcpBefore: after.tcp, tcpAfter: readAfter.tcp }] };
  writeFileSync(resolve(state.directory, 'mesh.json'), `${canonical(dataset)}\n`);
  const archive = buildArchive({ ...input, meshDataset: dataset }); validateArchive(archive);
  assert.deepEqual(archive.graph.nodes, baseline.graph.nodes); assert.deepEqual(archive.graph.edges, baseline.graph.edges);
  const inventory = archive.graph.mesh!.comparisons.filter(item => item.from === 'orders-api' && item.to === 'inventory');
  assert(inventory.find(item => item.captureId === 'orders')?.observed);
  assert.equal(inventory.find(item => item.captureId === 'read-only')?.observed, false);
  assert(inventory.every(item => item.declared && item.staticEdgeIds.length > 0 && item.correlation.status === 'resolved'));
  assert(archive.graph.mesh!.comparisons.filter(item => item.protocol === 'tcp').every(item => item.staticEdgeIds.length === 0));
  const store = new SnapshotStore(resolve(state.directory, 'snapshots')); store.publish(archive);
  const summary = { profileId: state.id, snapshotId: archive.graph.id, datasetHash: archive.graph.mesh!.datasetHash, versions: state.versions, bindings, comparisons: archive.graph.mesh!.comparisons };
  writeFileSync(resolve(state.directory, 'summary.json'), `${canonical(summary)}\n`);
  console.log('G8 two real windows verified. Opening archived mesh evidence…');
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  await page.goto(`${kiali.origin}/kiali/console/graph/namespaces?namespaces=impact-g8&graphType=workload&duration=600`);
  await page.screenshot({ path: resolve(state.directory, 'kiali.png'), fullPage: true });
  const snapshots = new WorkspaceSnapshots(process.cwd(), store, () => ({ ...input, meshDataset: dataset }));
  api = createDemoApi(undefined, snapshots); api.listen(0, '127.0.0.1');
  await new Promise<void>(done => api!.once('listening', done));
  const port = (api.address() as { port: number }).port;
  const evidence = await fetch(`http://127.0.0.1:${port}/api/snapshots/${archive.graph.id}/mesh`); assert(evidence.ok); assert.deepEqual(await evidence.json(), dataset);
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const demoPort = (reservation.address() as { port: number }).port; await new Promise<void>(done => reservation.close(() => done()));
  demo = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/demo/vite.config.ts', 'apps/demo'], { env: { ...process.env, DEMO_PORT: String(demoPort), DEMO_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let demoLogs = ''; for (const stream of [demo.stdout, demo.stderr]) stream!.on('data', data => { demoLogs += data; });
  await until(async () => { if (demo!.exitCode !== null) throw new Error(demoLogs); try { return (await fetch(`http://127.0.0.1:${demoPort}`)).ok; } catch { return false; } }, Boolean);
  await page.goto(`http://127.0.0.1:${demoPort}`);
  await page.getByRole('button', { name: 'IMPACT GRAPH', exact: true }).click();
  await page.getByRole('region', { name: 'Service mesh comparison' }).waitFor({ timeout: 15_000 });
  await page.getByLabel('Mesh window').selectOption('read-only');
  assert(await page.getByRole('region', { name: 'Service mesh comparison' }).getByText('not observed in this window').count() > 0);
  await page.screenshot({ path: resolve(state.directory, 'mesh-comparison.png'), fullPage: true });
  console.log(`G8 accepted. Evidence: ${state.directory}; snapshot ${archive.graph.id}`);
} finally {
  await browser?.close();
  if (demo && demo.exitCode === null) { const done = once(demo, 'exit'); demo.kill('SIGTERM'); await done; }
  if (api) { api.closeAllConnections(); await new Promise<void>(done => api!.close(() => done())); }
  await Promise.all(active.map(item => item.close()));
  if (!id) await down(state);
}
