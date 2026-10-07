import assert from 'node:assert/strict';
import { handleCreateOrder } from '../supabase/functions/create-order/handler.ts';
import { handleWebhook } from '../supabase/functions/payment-webhook/handler.ts';
import { hmacHex } from '../supabase/functions/_shared/logic.ts';

const ENV: Record<string, string> = { ALLOWED_ORIGINS: 'https://airver.example', TURNSTILE_SECRET: 'ts', IP_HASH_SALT: 'salt', SITE_URL: 'https://airver.example/', CHARGILY_SECRET_KEY: 'sk_test', CHARGILY_MODE: 'test', SUPABASE_URL: 'https://x.supabase.co' };
type Call = { fn: string; args: any };
function mk(opts: { rpc?: (fn: string, a: any) => any; captcha?: boolean; chargily?: 'ok' | 'fail'; env?: Record<string, string>; checkout?: any } = {}) {
  const calls: Call[] = []; const urls: { url: string; body: any }[] = [];
  const deps = {
    env: (k: string) => ({ ...ENV, ...opts.env })[k] ?? '',
    rpc: async (fn: string, args: any) => { calls.push({ fn, args }); return (opts.rpc?.(fn, args)) ?? { data: null, error: null }; },
    fetch: (async (url: any, init: any) => {
      const u = String(url); urls.push({ url: u, body: init?.body });
      if (u.includes('siteverify')) return new Response(JSON.stringify({ success: opts.captcha !== false }));
      if (u.endsWith('/checkouts') && init?.method === 'POST') return opts.chargily === 'fail' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ id: 'ck_1', checkout_url: 'https://pay.chargily.dz/test/checkouts/ck_1/pay' }));
      if (u.includes('/checkouts/')) return new Response(JSON.stringify(opts.checkout ?? { id: 'ck_1', status: 'paid', amount: 9500 }));
      throw new Error('unexpected fetch ' + u);
    }) as typeof fetch,
  };
  return { deps, calls, urls };
}
const good = { name: 'Sara Haddad', phone: '0661234567', address: 'Rue 12, Bir El Djir', wilaya_code: 31, delivery: 'home', method: 'cod', items: [{ sku: 'hoodie', size: 'M', qty: 1 }], turnstile_token: 'tok' };
const req = (b: unknown, o: Record<string, string> = {}, method = 'POST') => new Request('https://x.supabase.co/functions/v1/create-order', { method, headers: { origin: 'https://airver.example', 'content-type': 'application/json', 'cf-connecting-ip': '41.1.2.3', ...o }, body: method === 'POST' ? JSON.stringify(b) : undefined });
let n = 0; const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log('ok  -', name); };
const okRpc = (fn: string) => fn === 'create_order' ? { data: { ref: '#AV-K7M2QX9P', total: 9700, subtotal: 8900, shipping_fee: 800 }, error: null } : { data: null, error: null };

await t('COD: price/total never read from the client; server values returned', async () => {
  const m = mk({ rpc: okRpc });
  const r = await handleCreateOrder(req({ ...good, total: 1, totalNum: 1, price: 1, ref: '#AV-000000', status: 'paid', items: [{ sku: 'hoodie', size: 'M', qty: 1, price: 1 }] }), m.deps);
  assert.equal(r.status, 200); const j = await r.json();
  assert.deepEqual(j, { ref: '#AV-K7M2QX9P', total: 9700, subtotal: 8900, shipping_fee: 800 });
  const sent = m.calls.find((c) => c.fn === 'create_order')!.args.p;
  for (const k of ['total', 'totalNum', 'price', 'ref', 'status', 'turnstile_token']) assert.ok(!(k in sent), 'leaked ' + k);
  assert.ok(!('price' in sent.items[0]));
  assert.match(sent.ip_hash, /^[0-9a-f]{32}$/); assert.ok(!JSON.stringify(sent).includes('41.1.2.3'));
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://airver.example');
});
await t('captcha failure → 403 and nothing is written', async () => {
  const m = mk({ captcha: false, rpc: okRpc }); const r = await handleCreateOrder(req(good), m.deps);
  assert.equal(r.status, 403); assert.equal((await r.json()).error, 'CAPTCHA_FAILED'); assert.equal(m.calls.length, 0);
});
await t('missing token → 403', async () => { const m = mk({ rpc: okRpc }); const r = await handleCreateOrder(req({ ...good, turnstile_token: '' }), m.deps); assert.equal(r.status, 403); assert.equal(m.calls.length, 0); });
await t('foreign / missing origin is refused', async () => {
  const m = mk({ rpc: okRpc });
  assert.equal((await handleCreateOrder(req(good, { origin: 'https://evil.example' }), m.deps)).status, 403);
  const noOrigin = new Request('https://x/f', { method: 'POST', body: JSON.stringify(good) });
  assert.equal((await handleCreateOrder(noOrigin, m.deps)).status, 403); assert.equal(m.calls.length, 0);
  assert.equal((await handleCreateOrder(req(null, {}, 'OPTIONS'), m.deps)).status, 204);
});
await t('validation errors → 400 without touching the database', async () => {
  const m = mk({ rpc: okRpc });
  for (const bad of [{ ...good, phone: 'abc' }, { ...good, wilaya_code: 99 }, { ...good, items: [] }, { ...good, maps_url: 'https://evil.com' }]) assert.equal((await handleCreateOrder(req(bad), m.deps)).status, 400);
  assert.equal((await handleCreateOrder(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://airver.example' }, body: '{nope' }), m.deps)).status, 400);
  assert.equal((await handleCreateOrder(new Request('https://x/f', { method: 'POST', headers: { origin: 'https://airver.example' }, body: 'x'.repeat(30000) }), m.deps)).status, 413);
  assert.equal(m.calls.length, 0);
});
await t('database codes map to safe answers', async () => {
  const cases: [string, number, string][] = [['RATE_LIMIT', 429, 'RATE_LIMIT'], ['OUT_OF_STOCK:M', 409, 'OUT_OF_STOCK'], ['INVALID_SIZE', 422, 'INVALID_SIZE'], ['PRICE_CHANGED:9700', 409, 'PRICE_CHANGED'], ['relation "orders" does not exist', 500, 'SERVER_ERROR']];
  for (const [msg, status, code] of cases) {
    const r = await handleCreateOrder(req(good), mk({ rpc: () => ({ data: null, error: { message: msg } }) }).deps);
    assert.equal(r.status, status); const j = await r.json(); assert.equal(j.error, code); assert.ok(!JSON.stringify(j).includes('relation'));
    if (code === 'OUT_OF_STOCK') assert.equal(j.size, 'M');
    if (code === 'PRICE_CHANGED') assert.equal(j.total, 9700);
  }
});
await t('fails closed when secrets are missing', async () => {
  for (const k of ['TURNSTILE_SECRET', 'IP_HASH_SALT', 'SITE_URL']) { const m = mk({ rpc: okRpc, env: { [k]: '' } }); assert.equal((await handleCreateOrder(req(good), m.deps)).status, 500); assert.equal(m.calls.length, 0); }
});
await t('online: Chargily gets the SERVER total and SITE_URL return links', async () => {
  const m = mk({ rpc: okRpc }); const r = await handleCreateOrder(req({ ...good, method: 'online', successUrl: 'https://evil.example', total: 1 }), m.deps);
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.checkout_url, 'https://pay.chargily.dz/test/checkouts/ck_1/pay');
  const sent = JSON.parse(m.urls.find((u) => u.url.endsWith('/checkouts'))!.body);
  assert.equal(sent.amount, 9700); assert.equal(sent.currency, 'dzd');
  assert.equal(sent.success_url, 'https://airver.example/?payment=success&ref=%23AV-K7M2QX9P'); assert.ok(!JSON.stringify(sent).includes('evil'));
  assert.equal(sent.webhook_endpoint, 'https://x.supabase.co/functions/v1/payment-webhook');
  assert.deepEqual(m.calls.map((c) => c.fn), ['create_order', 'attach_payment']);
  assert.ok(m.urls.find((u) => u.url.includes('/test/api/v2')));
});
await t('online: Chargily down → order cancelled and stock released', async () => {
  const m = mk({ rpc: okRpc, chargily: 'fail' }); const r = await handleCreateOrder(req({ ...good, method: 'online' }), m.deps);
  assert.equal(r.status, 502); assert.deepEqual(m.calls.map((c) => c.fn), ['create_order', 'cancel_order']);
});
await t('online without a Chargily key → 503 before any order exists', async () => {
  const m = mk({ rpc: okRpc, env: { CHARGILY_SECRET_KEY: '' } }); const r = await handleCreateOrder(req({ ...good, method: 'online' }), m.deps); assert.equal(r.status, 503); assert.equal(m.calls.length, 0);
});

// ---------------- webhook ----------------
const wreq = async (body: string, sig?: string | null) => new Request('https://x/functions/v1/payment-webhook', { method: 'POST', headers: sig === null ? {} : { signature: sig ?? await hmacHex('sk_test', body) }, body });
const evt = JSON.stringify({ type: 'checkout.paid', data: { id: 'ck_1', amount: 1 } });
await t('webhook: valid signature + Chargily says paid → order marked paid with the amount Chargily reports', async () => {
  const m = mk({ rpc: () => ({ data: 'paid', error: null }) }); const r = await handleWebhook(await wreq(evt), m.deps);
  assert.equal(r.status, 200); assert.deepEqual(m.calls, [{ fn: 'mark_order_paid', args: { p_payment_ref: 'ck_1', p_amount: 9500 } }]);
});
await t('webhook: forged / unsigned / tampered → 401, nothing happens', async () => {
  const m = mk(); assert.equal((await handleWebhook(await wreq(evt, 'deadbeef'), m.deps)).status, 401);
  assert.equal((await handleWebhook(await wreq(evt, null), m.deps)).status, 401);
  const sig = await hmacHex('sk_test', evt); assert.equal((await handleWebhook(await wreq(evt.replace('"amount":1', '"amount":2'), sig), m.deps)).status, 401);
  assert.equal(m.calls.length, 0);
});
await t('webhook: signed "paid" but Chargily API says pending → NOT marked paid', async () => {
  const m = mk({ checkout: { id: 'ck_1', status: 'pending', amount: 9500 } }); const r = await handleWebhook(await wreq(evt), m.deps); assert.equal(r.status, 200); assert.equal(m.calls.length, 0);
});
await t('webhook: amount mismatch → 422 (order stays unpaid)', async () => {
  const m = mk({ rpc: () => ({ data: null, error: { message: 'AMOUNT_MISMATCH' } }) }); assert.equal((await handleWebhook(await wreq(evt), m.deps)).status, 422);
});
await t('webhook: failed/expired → order released', async () => {
  const m = mk({ checkout: { id: 'ck_1', status: 'expired', amount: 9500 } }); await handleWebhook(await wreq(evt), m.deps); assert.deepEqual(m.calls.map((c) => c.fn), ['cancel_order_by_payment']);
});
console.log(`\n${n} handler tests passed`);
