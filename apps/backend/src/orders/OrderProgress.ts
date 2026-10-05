/** Explicit HTTP integration: the orders API never reads consumer databases. */
export async function orderProgress(id: string) {
  if (!process.env.BROKER_URL) return { mode: 'disabled', preparation: { status: 'not-enabled' }, notifications: { status: 'not-enabled' } };
  async function query(origin: string) {
    const address = new URL(origin);
    if (address.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(address.hostname) || address.username || address.password) throw new Error('Consumer must be local HTTP');
    try {
      const response = await fetch(new URL(`/orders/${id}`, address), { signal: AbortSignal.timeout(700) });
      if (response.status === 404) return { status: 'pending' };
      if (!response.ok) return { status: 'unavailable' };
      return await response.json() as Record<string, unknown>;
    } catch { return { status: 'unavailable' }; }
  }
  const [preparation, notifications] = await Promise.all([
    query(process.env.PREPARATION_URL ?? 'http://127.0.0.1:3005'), query(process.env.NOTIFICATIONS_URL ?? 'http://127.0.0.1:3004'),
  ]);
  return { mode: 'events', preparation, notifications };
}