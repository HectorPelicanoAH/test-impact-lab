import { readFileSync } from 'node:fs';
export const versions = JSON.parse(readFileSync(new URL('./versions.json', import.meta.url), 'utf8'));
export const services = [
  { name: 'frontend', port: 8080, command: ['node', 'scripts/mesh/frontend.mjs'], path: 'apps/frontend/src/OrdersPage.tsx', symbol: 'OrdersPage' },
  { name: 'orders-api', port: 3001, command: ['node', 'apps/backend/dist/main.js'], path: 'apps/backend/src/http.ts', symbol: 'createHttpServer' },
  { name: 'inventory', port: 3003, path: 'external/inventory/src/server.ts', symbol: 'createInventoryServer' },
  { name: 'notifications', port: 3004, command: ['node', 'apps/notifications/dist/main.js'], path: 'apps/notifications/src/main.ts', symbol: 'notify' },
  { name: 'preparation', port: 3005, command: ['node', 'apps/preparation/dist/main.js'], path: 'apps/preparation/src/main.ts', symbol: 'prepare' },
  { name: 'rabbitmq', port: 5672, broker: 'orders-rabbitmq' },
];
export function manifests(state) {
  const namespace = versions.namespace, owner = state.id;
  const namespaced = (name, labels = {}) => ({ name, namespace, labels: { 'impact-lab-owner': owner, ...labels } });
  const items = [{ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace, labels: { 'istio-injection': 'enabled', 'impact-lab-owner': owner } } }];
  const origin = (service, port) => `http://${service}.${namespace}.svc.cluster.local:${port}`;
  for (const service of services) {
    const external = service.name === 'inventory', broker = service.name === 'rabbitmq';
    const revision = external ? state.inventoryRevision : state.revision;
    const labels = { app: service.name, version: 'v1', 'service.istio.io/canonical-name': service.name, 'service.istio.io/canonical-revision': 'v1' };
    const env = [{ name: 'IMPACT_MESH_NAMESPACE', value: namespace }];
    if (broker) env.push({ name: 'RABBITMQ_DEFAULT_USER', value: 'impact' }, { name: 'RABBITMQ_DEFAULT_PASS', value: 'impact-local-demo' }, { name: 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS', value: '+S 2:2 +A 4' });
    if (['orders-api', 'notifications', 'preparation'].includes(service.name)) env.push({ name: 'BROKER_URL', value: `amqp://impact:impact-local-demo@rabbitmq.${namespace}.svc.cluster.local:5672` }, { name: 'BROKER_NAMESPACE', value: 'impact.mesh' });
    if (service.name === 'orders-api') env.push({ name: 'INVENTORY_URL', value: origin('inventory', 3003) }, { name: 'NOTIFICATIONS_URL', value: origin('notifications', 3004) }, { name: 'PREPARATION_URL', value: origin('preparation', 3005) });
    const container = { name: 'app', image: broker ? versions.rabbitmqImage : external ? state.inventoryImage : state.appImage, imagePullPolicy: 'IfNotPresent', env,
      ...(service.command ? { command: service.command } : {}), ports: [{ containerPort: service.port }],
      resources: { requests: { cpu: broker ? '100m' : '25m', memory: broker ? '256Mi' : '64Mi' }, limits: { memory: broker ? '768Mi' : '256Mi' } },
      ...(broker ? { readinessProbe: { tcpSocket: { port: service.port }, initialDelaySeconds: 5, periodSeconds: 2 } } : { readinessProbe: { httpGet: { path: '/health', port: service.port }, periodSeconds: 2 }, volumeMounts: [{ name: 'data', mountPath: '/data' }] }) };
    items.push({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: namespaced(service.name, labels), spec: { replicas: 1, selector: { matchLabels: { app: service.name, version: 'v1' } },
      template: { metadata: { labels: { ...labels, 'impact-lab-owner': owner }, annotations: { 'impact-lab/revision': revision, 'proxy.istio.io/config': '{"holdApplicationUntilProxyStarts":true}', 'sidecar.istio.io/proxyCPU': '25m', 'sidecar.istio.io/proxyMemory': '64Mi', 'sidecar.istio.io/proxyMemoryLimit': '192Mi' } },
        spec: { enableServiceLinks: false, containers: [container], volumes: [{ name: 'data', emptyDir: {} }] } } } });
    items.push({ apiVersion: 'v1', kind: 'Service', metadata: namespaced(service.name), spec: { selector: { app: service.name }, ports: [{ name: broker ? 'tcp-amqp' : 'http', port: service.port, targetPort: service.port }] } });
  }
  return { apiVersion: 'v1', kind: 'List', items };
}
