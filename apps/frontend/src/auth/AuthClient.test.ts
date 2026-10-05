import { expect, test, vi } from 'vitest';
import { AuthClient } from './AuthClient';

test('[FU4] AuthClient maps typed API errors and rejects malformed responses', async () => {
  const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
  }), { status: 401 }));
  await expect(new AuthClient(denied).login('demo@example.com', 'wrong')).rejects.toThrow('Invalid email or password.');

  const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ redirectTo: '/home' }), { status: 200 }));
  await expect(new AuthClient(malformed).login('demo@example.com', 'secret')).rejects.toThrow('Unexpected response');
});
