import { createLoginController } from '../../apps/backend/src/composition';
import { createHttpServer } from '../../apps/backend/src/http';
import type { UserRepository } from '../../apps/backend/src/auth/domain/UserRepository';

export async function startTestApi(repository?: UserRepository) {
  const server = createHttpServer(await createLoginController(repository));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
