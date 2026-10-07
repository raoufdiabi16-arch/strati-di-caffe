import { verifySignature } from '../_shared/logic.ts';
import type { Deps } from '../create-order/handler.ts';

/** Chargily → us. The body is HMAC-signed with your secret key; we also re-read the checkout from
 *  Chargily's API, so a forged or replayed message can never mark an order as paid. */
export async function handleWebhook(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  const secret = deps.env('CHARGILY_SECRET_KEY');
  if (!secret) return new Response('not configured', { status: 503 });

  const raw = await req.text();
  if (raw.length > 100000) return new Response('too large', { status: 413 });
  if (!(await verifySignature(raw, req.headers.get('signature'), secret))) return new Response('invalid signature', { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const id = evt?.data?.id;
  if (typeof id !== 'string' || id.length > 100) return new Response('ignored', { status: 200 });

  const base = deps.env('CHARGILY_MODE') === 'live' ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2';
  let ck: any;
  try {
    const r = await deps.fetch(`${base}/checkouts/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return new Response('lookup failed', { status: 502 });   // non-2xx → Chargily retries
    ck = await r.json();
  } catch { return new Response('lookup failed', { status: 502 }); }

  if (ck?.status === 'paid') {
    const { data, error } = await deps.rpc('mark_order_paid', { p_payment_ref: id, p_amount: Number(ck.amount) });
    if (error) {
      console.error('mark_order_paid:', error.message);
      return new Response(error.message.includes('AMOUNT_MISMATCH') ? 'amount mismatch' : 'error', { status: error.message.includes('AMOUNT_MISMATCH') ? 422 : 500 });
    }
    return new Response(String(data), { status: 200 });
  }
  if (['failed', 'canceled', 'expired'].includes(ck?.status)) {
    await deps.rpc('cancel_order_by_payment', { p_payment_ref: id, p_reason: String(ck.status) });
  }
  return new Response('ok', { status: 200 });
}
