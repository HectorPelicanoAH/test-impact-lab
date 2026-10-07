import { placeOrder, startBrowserTelemetry } from '@test-impact/telemetry/browser';
import { useState, type FormEvent } from 'react';

startBrowserTelemetry(import.meta.env.VITE_OTEL_CODE_REVISION);

interface Order { id: string; sku: string; quantity: number; status: string }
interface Progress { mode: string; preparation: { status: string }; notifications: { status: string } }
export function OrdersPage() {
  const [sku, setSku] = useState('demo-widget');
  const [quantity, setQuantity] = useState(1);
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  async function refreshProgress(id: string) {
    try {
      const response = await fetch(`/api/orders/${id}/progress`);
      if (!response.ok) throw new Error('Consumer status could not be retrieved.');
      setProgress(await response.json() as Progress);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Status unavailable.'); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setOrder(undefined); setProgress(undefined);
    try {
      const response = await placeOrder(JSON.stringify({ sku, quantity }));
      const result = await response.json() as Order & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Order request failed.');
      const retrieved = await fetch(`/api/orders/${encodeURIComponent(result.id)}`);
      if (!retrieved.ok) throw new Error('Order was created but its status could not be retrieved.');
      setOrder(await retrieved.json() as Order);
      await refreshProgress(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Order request failed.'); }
    finally { setBusy(false); }
  }
  return <main className="card orders-card"><p className="eyebrow">TEST IMPACT LAB / ORDERS</p><h1>Place an order</h1>
    <p className="intro">Inventory checked over HTTP. Accepted orders and their events are stored atomically; the events profile delivers them to independent consumers.</p>
    <form onSubmit={submit}><label>Product<select value={sku} onChange={event => setSku(event.target.value)}><option value="demo-widget">Demo widget (available)</option><option value="demo-gadget">Demo gadget (out of stock)</option></select></label>
      <label>Quantity<input aria-label="Quantity" type="number" min="1" max="50" required value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label>
      <button disabled={busy} type="submit">{busy ? 'Checking inventory…' : 'Place order'}</button></form>
    {error && <p role="alert">{error}</p>}{order && <section role="status"><h2>Order accepted</h2><p>Order {order.id}</p><p>{order.quantity} × {order.sku} · {order.status}</p></section>}
    {order && <section aria-label="Event processing"><h2>Independent processing</h2>
      {progress?.mode === 'disabled' ? <p>Events profile is not enabled. The outbox remains pending; no consumer success is claimed.</p> : <>
        <p>Preparation: <b>{progress?.preparation.status ?? 'unknown'}</b></p><p>Local mailbox: <b>{progress?.notifications.status ?? 'unknown'}</b></p>
        <p>Queried through HTTP. Delivery is at least once; inboxes deduplicate event IDs.</p></>}
      <button type="button" onClick={() => { setError(''); void refreshProgress(order.id); }}>Refresh processing status</button></section>}
    <aside><a href="/">Back to sign in</a></aside></main>;
}