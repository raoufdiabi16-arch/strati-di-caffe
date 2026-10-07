import assert from 'node:assert/strict';
import { cleanText, normalizePhone, parseMapsUrl, parseItems, parseOrder, hmacHex, verifySignature, hashIp, pickOrigin } from '../supabase/functions/_shared/logic.ts';
let n = 0; const t = (name: string, fn: () => unknown | Promise<unknown>) => Promise.resolve(fn()).then(() => { n++; console.log('ok  -', name); });

await t('phone formats', () => {
  assert.equal(normalizePhone('0551 23 45 67'), '0551234567');
  assert.equal(normalizePhone('+213 551-23-45-67'), '0551234567');
  assert.equal(normalizePhone('00213661234567'), '0661234567');
  assert.equal(normalizePhone('٠٥٥١٢٣٤٥٦٧'), '0551234567');
  assert.equal(normalizePhone('0412345678'), null);
  assert.equal(normalizePhone('055123456'), null);
  assert.equal(normalizePhone("0551234567'; drop table orders;--"), null);
});
await t('text is cleaned (bidi / zero-width / control)', () => {
  assert.equal(cleanText('  Sara\u202E  Haddad\u200B\n\t', 60), 'Sara Haddad');
  assert.equal(cleanText(123 as unknown, 5), '');
  assert.equal(cleanText('x'.repeat(500), 60).length, 60);
});
await t('maps url allow-list', () => {
  assert.deepEqual(parseMapsUrl(''), { ok: true, value: null });
  assert.equal(parseMapsUrl('https://maps.app.goo.gl/abc123').ok, true);
  assert.equal(parseMapsUrl('https://www.google.com/maps/place/Alger/@36.7,3.0,15z').ok, true);
  assert.equal(parseMapsUrl('https://maps.google.dz/?q=36.7,3.0').ok, true);
  for (const bad of ['javascript:alert(1)', 'http://maps.app.goo.gl/x', 'https://evil.com/maps', 'https://google.com.evil.com/maps', 'https://maps.app.goo.gl.evil.com/x', 'https://user:pw@maps.app.goo.gl/x', 'https://www.google.com/search?q=x'])
    assert.equal(parseMapsUrl(bad).ok, false, bad);
});
await t('items: validated, merged, capped, no prices accepted', () => {
  assert.deepEqual(parseItems([{ sku: 'hoodie', size: 'M', qty: 1 }, { sku: 'hoodie', size: 'M', qty: 2 }, { sku: 'hoodie', size: 'L', qty: 1, price: 1 }]),
    [{ sku: 'hoodie', size: 'M', qty: 3 }, { sku: 'hoodie', size: 'L', qty: 1 }]);
  assert.equal(parseItems([]), null);
  assert.equal(parseItems([{ sku: 'hoodie', size: 'M', qty: 0 }]), null);
  assert.equal(parseItems([{ sku: 'hoodie', size: 'M', qty: 1.5 }]), null);
  assert.equal(parseItems([{ sku: 'hoodie', size: 'M', qty: 11 }]), null);
  assert.equal(parseItems([{ sku: "x'; --", size: 'M', qty: 1 }]), null);
  assert.equal(parseItems('nope'), null);
});
const good = { name: 'Sara Haddad', phone: '0661234567', address: 'Rue 12, Bir El Djir', wilaya_code: 31, delivery: 'home', method: 'cod', items: [{ sku: 'hoodie', size: 'M', qty: 1 }], turnstile_token: 'tok', total: 1, price: 1 };
await t('order parsing', () => {
  const r = parseOrder(good); assert.ok(r.ok);
  assert.ok(!('total' in (r as any).value) && !('price' in (r as any).value));
  assert.equal((r as any).value.phone, '0661234567');
  for (const [k, v] of [['name', 'ab'], ['phone', '123'], ['address', 'x'], ['wilaya_code', 70], ['wilaya_code', 0], ['delivery', 'drone'], ['method', 'free'], ['items', []], ['maps_url', 'https://evil.com']] as const) {
    const bad = parseOrder({ ...good, [k]: v }); assert.ok(!bad.ok && (bad as any).field === k, k);
  }
  assert.ok(!parseOrder(null).ok);
});
await t('request_id (idempotency key) must be a UUID', () => {
  const ok = parseOrder({ ...good, request_id: '3F2504E0-4F89-41D3-9A0C-0305E82C3301' }); assert.ok(ok.ok); assert.equal((ok as any).value.request_id, '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  assert.equal((parseOrder(good) as any).value.request_id, null);
  assert.ok(!parseOrder({ ...good, request_id: 'abc' }).ok); assert.ok(!parseOrder({ ...good, request_id: 5 }).ok);
});
await t('expected_total is only an optional integer check', () => {
  assert.equal((parseOrder({ ...good, expected_total: 9300 }) as any).value.expected_total, 9300);
  assert.equal((parseOrder(good) as any).value.expected_total, null);
  for (const bad of [-1, 1.5, 'abc', 99999999999]) assert.ok(!parseOrder({ ...good, expected_total: bad }).ok, String(bad));
});
await t('hmac / webhook signature', async () => {
  const body = '{"type":"checkout.paid","data":{"id":"abc","amount":9500}}';
  const sig = await hmacHex('sk_test_secret', body);
  assert.equal(sig.length, 64);
  assert.equal(await verifySignature(body, sig, 'sk_test_secret'), true);
  assert.equal(await verifySignature(body + ' ', sig, 'sk_test_secret'), false);
  assert.equal(await verifySignature(body, sig, 'other'), false);
  assert.equal(await verifySignature(body, null, 'sk_test_secret'), false);
  assert.equal(await verifySignature(body, '', 'sk_test_secret'), false);
});
await t('ip hash is stable, salted, not the ip', async () => {
  const a = await hashIp('41.100.1.2', 'salt1'); const b = await hashIp('41.100.1.2', 'salt1'); const c = await hashIp('41.100.1.2', 'salt2');
  assert.equal(a, b); assert.notEqual(a, c); assert.ok(!a.includes('41.100')); assert.equal(a.length, 32);
});
await t('cors origin allow-list', () => {
  assert.equal(pickOrigin('https://airver.example', ['https://airver.example']), 'https://airver.example');
  assert.equal(pickOrigin('https://evil.example', ['https://airver.example']), null);
  assert.equal(pickOrigin(null, ['https://airver.example']), null);
});
console.log(`\n${n} test groups passed`);
