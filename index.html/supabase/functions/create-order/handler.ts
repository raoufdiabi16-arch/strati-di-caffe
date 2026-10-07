import { parseOrder, hashIp, pickOrigin } from '../_shared/logic.ts';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
export type Deps = { env: (k: string) => string; rpc: Rpc; fetch: typeof fetch };

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function reply(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } });
}

async function verifyTurnstile(deps: Deps, token: string, ip: string): Promise<boolean> {
  if (!token || token.length > 2100) return false;
  const form = new URLSearchParams({ secret: deps.env('TURNSTILE_SECRET'), response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return j?.success === true;
  } catch {
    return false;
  }
}

/** Maps the database's RAISE EXCEPTION codes to safe HTTP answers (no internals leaked). */
function mapDbError(msg: string): { status: number; body: Record<string, unknown> } {
  if (msg.includes('RATE_LIMIT')) return { status: 429, body: { error: 'RATE_LIMIT' } };
  const changed = msg.match(/PRICE_CHANGED:(\d{1,9})/);
  if (changed) return { status: 409, body: { error: 'PRICE_CHANGED', total: Number(changed[1]) } };
  const stock = msg.match(/OUT_OF_STOCK:([A-Za-z0-9 _-]{1,20})/);
  if (stock) return { status: 409, body: { error: 'OUT_OF_STOCK', size: stock[1] } };
  for (const code of ['INVALID_WILAYA', 'INVALID_SIZE', 'UNKNOWN_PRODUCT', 'INVALID_METHOD', 'INVALID_DELIVERY', 'ONLINE_HOODIE_ONLY', 'EMPTY_CART'])
    if (msg.includes(code)) return { status: 422, body: { error: code } };
  return { status: 500, body: { error: 'SERVER_ERROR' } };
}

export async function handleCreateOrder(req: Request, deps: Deps): Promise<Response> {
  const allowed = deps.env('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = pickOrigin(req.headers.get('origin'), allowed);
  const cors: Record<string, string> = origin
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600' }
    : { 'Vary': 'Origin' };

  if (req.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' }, cors);
  if (!origin) return reply(403, { error: 'ORIGIN_NOT_ALLOWED' }, cors);

  // Fail closed if the server is not fully configured: never skip a security check.
  for (const k of ['TURNSTILE_SECRET', 'IP_HASH_SALT', 'SITE_URL']) if (!deps.env(k)) return reply(500, { error: 'SERVER_MISCONFIGURED' }, cors);

  const raw = await req.text();
  if (raw.length > 20000) return reply(413, { error: 'TOO_LARGE' }, cors);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reply(400, { error: 'INVALID_JSON' }, cors); }

  const parsed = parseOrder(body);
  if (!parsed.ok) return reply(400, { error: 'INVALID_FIELD', field: parsed.field }, cors);
  const o = parsed.value;

  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (!(await verifyTurnstile(deps, o.turnstile_token, ip))) return reply(403, { error: 'CAPTCHA_FAILED' }, cors);

  if (o.method === 'online' && !deps.env('CHARGILY_SECRET_KEY')) return reply(503, { error: 'PAYMENT_UNAVAILABLE' }, cors);

  const { turnstile_token: _t, ...order } = o;
  const created = await deps.rpc('create_order', { p: { ...order, ip_hash: await hashIp(ip, deps.env('IP_HASH_SALT')) } });
  if (created.error) {
    const m = mapDbError(created.error.message || '');
    if (m.status === 500) console.error('create_order failed:', created.error.message);
    return reply(m.status, m.body, cors);
  }
  const res = created.data as { ref: string; total: number; subtotal: number; shipping_fee: number };

  if (o.method === 'cod') return reply(200, { ref: res.ref, total: res.total, subtotal: res.subtotal, shipping_fee: res.shipping_fee }, cors);

  // ---- online payment: the amount sent to Chargily is the SERVER total; return URLs come from SITE_URL only ----
  const base = deps.env('CHARGILY_MODE') === 'live' ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2';
  const site = deps.env('SITE_URL').replace(/\/+$/, '');
  const q = encodeURIComponent(res.ref);
  try {
    const r = await deps.fetch(`${base}/checkouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.env('CHARGILY_SECRET_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: res.total,
        currency: 'dzd',
        success_url: `${site}/?payment=success&ref=${q}`,
        failure_url: `${site}/?payment=failed&ref=${q}`,
        webhook_endpoint: `${deps.env('SUPABASE_URL')}/functions/v1/payment-webhook`,
        description: `AIRVER ${res.ref}`,
        locale: 'fr',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const ck = await r.json();
    if (!r.ok || !ck?.checkout_url || !ck?.id) throw new Error('chargily ' + r.status);
    await deps.rpc('attach_payment', { p_ref: res.ref, p_payment_ref: String(ck.id) });
    return reply(200, { ref: res.ref, total: res.total, subtotal: res.subtotal, shipping_fee: res.shipping_fee, checkout_url: String(ck.checkout_url) }, cors);
  } catch (e) {
    console.error('checkout creation failed:', (e as Error).message);
    await deps.rpc('cancel_order', { p_ref: res.ref, p_reason: 'checkout_failed' });   // give the stock back
    return reply(502, { error: 'PAYMENT_UNAVAILABLE' }, cors);
  }
}
