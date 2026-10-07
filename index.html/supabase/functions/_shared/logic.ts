// Pure helpers shared by the Edge Functions. No Deno/Node specifics, so they can be unit-tested.

const CTRL = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Item = { sku: string; size: string; qty: number };
export type OrderInput = {
  name: string;
  phone: string;
  second_phone: string | null;
  address: string;
  maps_url: string | null;
  wilaya_code: number;
  delivery: 'home' | 'office';
  method: 'cod' | 'online';
  items: Item[];
  request_id: string | null;
  expected_total: number | null;
  turnstile_token: string;
};
export type Parsed = { ok: true; value: OrderInput } | { ok: false; field: string };

/** Trim, collapse whitespace, and strip control / invisible / bidi-override characters. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.normalize('NFKC').replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Accepts 05/06/07 + 8 digits, with +213 / 00213 / 213 prefixes. Returns local form 0XXXXXXXXX or null. */
export function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  let d = v
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\s.\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('00213')) d = '0' + d.slice(5);
  else if (d.startsWith('213') && d.length === 12) d = '0' + d.slice(3);
  return /^0[567]\d{8}$/.test(d) ? d : null;
}

/** Only https links that really point to Google Maps are accepted (blocks javascript:, phishing, etc.). */
export function parseMapsUrl(v: unknown): { ok: boolean; value: string | null } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, value: null };
  const raw = v.trim();
  if (raw === '') return { ok: true, value: null };
  if (raw.length > 500) return { ok: false, value: null };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, value: null }; }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, value: null };
  const h = u.hostname.toLowerCase();
  const p = u.pathname;
  const okHost =
    h === 'maps.app.goo.gl' ||
    (h === 'goo.gl' && p.startsWith('/maps')) ||
    /^maps\.google\.[a-z.]{2,10}$/.test(h) ||
    (/^(www\.)?google\.[a-z.]{2,10}$/.test(h) && p.startsWith('/maps')) ||
    (h === 'g.co' && p.startsWith('/kgs'));
  return okHost ? { ok: true, value: u.toString() } : { ok: false, value: null };
}

/** Validates the cart lines. Prices are NEVER taken from the client. */
export function parseItems(raw: unknown): Item[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) return null;
  const merged = new Map<string, Item>();
  let total = 0;
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') return null;
    const sku = typeof r.sku === 'string' ? r.sku.trim() : '';
    const size = cleanText(r.size, 20);
    const qty = Number(r.qty);
    if (!ID_RE.test(sku) || !size || !Number.isInteger(qty) || qty < 1 || qty > 10) return null;
    const key = sku + '::' + size;
    const prev = merged.get(key);
    const nq = (prev ? prev.qty : 0) + qty;
    if (nq > 10) return null;
    merged.set(key, { sku, size, qty: nq });
    total += qty;
  }
  return total <= 20 ? [...merged.values()] : null;
}

export function parseOrder(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;
  const name = cleanText(b.name, 60);
  if (name.length < 3) return { ok: false, field: 'name' };
  const phone = normalizePhone(b.phone);
  if (!phone) return { ok: false, field: 'phone' };
  let second_phone: string | null = null;
  if (b.second_phone !== undefined && b.second_phone !== null && String(b.second_phone).trim() !== '') {
    second_phone = normalizePhone(b.second_phone);
    if (!second_phone) return { ok: false, field: 'second_phone' };
  }
  const address = cleanText(b.address, 200);
  if (address.length < 5) return { ok: false, field: 'address' };
  const maps = parseMapsUrl(b.maps_url);
  if (!maps.ok) return { ok: false, field: 'maps_url' };
  const wilaya_code = Number(b.wilaya_code);
  if (!Number.isInteger(wilaya_code) || wilaya_code < 1 || wilaya_code > 69) return { ok: false, field: 'wilaya_code' };
  if (b.delivery !== 'home' && b.delivery !== 'office') return { ok: false, field: 'delivery' };
  if (b.method !== 'cod' && b.method !== 'online') return { ok: false, field: 'method' };
  const items = parseItems(b.items);
  if (!items) return { ok: false, field: 'items' };
  let request_id: string | null = null;
  if (b.request_id !== undefined && b.request_id !== null) {
    if (typeof b.request_id !== 'string' || !UUID_RE.test(b.request_id)) return { ok: false, field: 'request_id' };
    request_id = b.request_id.toLowerCase();
  }
  let expected_total: number | null = null;
  if (b.expected_total !== undefined && b.expected_total !== null) {
    const e = Number(b.expected_total);
    if (!Number.isInteger(e) || e < 0 || e > 10_000_000) return { ok: false, field: 'expected_total' };
    expected_total = e;
  }
  const token = typeof b.turnstile_token === 'string' ? b.turnstile_token : '';
  return {
    ok: true,
    value: { name, phone, second_phone, address, maps_url: maps.value, wilaya_code, delivery: b.delivery, method: b.method, items, request_id, expected_total, turnstile_token: token },
  };
}

// ---------- crypto helpers (WebCrypto: available in Deno and Node 20+) ----------
const enc = new TextEncoder();

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Chargily signs the raw body with HMAC-SHA256 using the secret API key and sends it in the `signature` header. */
export async function verifySignature(raw: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return safeEqual(await hmacHex(secret, raw), signature.trim().toLowerCase());
}

/** IPs are never stored in clear: only a salted HMAC (privacy + still usable for rate limiting). */
export async function hashIp(ip: string, salt: string): Promise<string> {
  return (await hmacHex(salt, ip || 'unknown')).slice(0, 32);
}

export function pickOrigin(origin: string | null, allowed: string[]): string | null {
  return origin && allowed.includes(origin) ? origin : null;
}
