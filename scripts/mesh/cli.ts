import { readState, up, down, forward, kubectl } from './lifecycle.mjs';
import { buildArchive, loadWorkspace } from '../graph/snapshot';
const [action, id] = process.argv.slice(2);
if (action === 'up') await up(buildArchive(loadWorkspace(process.cwd(), '')).graph.repositories[0]!.revision);
else if (action === 'down' && id) await down(readState(id));
else if (action === 'status' && id) console.log(await kubectl(readState(id), ['get', 'pods', '-n', 'impact-g8', '-o', 'wide']));
else if (action === 'view' && id) {
  const state = readState(id);
  const active: Awaited<ReturnType<typeof forward>>[] = [];
  try { active.push(await forward(state, 'frontend', 'impact-g8', 8080)); active.push(await forward(state, 'kiali', 'istio-system', 20001)); }
  catch (error) { await Promise.all(active.map(item => item.close())); throw error; }
  console.log(`Orders ${active[0]!.origin}/orders\nKiali ${active[1]!.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void Promise.all(active.map(item => item.close())); });
} else throw new Error('Usage: pnpm mesh:up | pnpm mesh:down <ID> | pnpm mesh:status <ID> | pnpm mesh:view <ID>');
