/** The optional G8 profile admits only these exact service identities in its own namespace. */
export const meshNamespace = 'impact-g8';
export function serviceHostAllowed(hostname: string, service: 'inventory' | 'notifications' | 'preparation' | 'rabbitmq') {
  return ['127.0.0.1', 'localhost'].includes(hostname)
    || (process.env.IMPACT_MESH_NAMESPACE === meshNamespace && hostname === `${service}.${meshNamespace}.svc.cluster.local`);
}
export function listenHost() { return process.env.IMPACT_MESH_NAMESPACE === meshNamespace ? '0.0.0.0' : '127.0.0.1'; }
