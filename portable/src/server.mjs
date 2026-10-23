import { normalizeSnapshot } from './core.mjs';
import { explorerFromLegacy } from '../lib/viewer/createExplorer.js';
export const createViewer = snapshot => explorerFromLegacy(normalizeSnapshot(snapshot));
export async function listenViewer(snapshot, port = 0) {
  const server = createViewer(snapshot);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
