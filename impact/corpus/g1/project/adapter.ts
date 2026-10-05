import type { Port } from './port';
export class Adapter implements Port { send() { return 'ok'; } }
export function compose() { const port: Port = new Adapter(); return port.send(); }