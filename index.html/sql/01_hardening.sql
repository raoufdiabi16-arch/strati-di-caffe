-- =====================================================================================
-- AIRVER — database hardening  (run ONCE in Supabase → SQL Editor, then deploy the 2 functions)
-- Safe to re-run. Read the "AFTER RUNNING" notes at the bottom.
--
-- What this does
--   1. The browser can no longer write to `orders` (or read it). Orders are created ONLY by the
--      `create-order` Edge Function, through create_order(), which:
--        - recomputes every price on the server (hoodie price, online discount, catalog prices),
--        - adds the delivery fee for the customer's wilaya from `shipping_rates`,
--        - decrements real stock atomically (no overselling),
--        - generates an unguessable order reference on the server,
--        - rate-limits by hashed IP and by phone number.
--   2. The fake "Reserved 9:59" hold is removed: `stock_reservations` is dropped (its open
--      insert/delete policies let anyone wipe or flood it). Real stock is enforced at order time,
--      and the site only sees a status per size (ok / low / sold_out) through `public_stock`.
--   3. Online payments: orders wait as `pending_payment`; they become paid ONLY when the signed
--      Chargily webhook confirms the same amount. Unpaid ones are cancelled and restocked.
-- =====================================================================================

-- ---------- 0. PRE-FLIGHT (optional, read-only). Run these first if you want to look around:
--   select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename in ('orders','hoodie_inventory','stock_reservations','products');
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.orders'::regclass;
--   select status, count(*) from public.orders group by 1;

-- ---------- PRE-FLIGHT: stop with a clear message BEFORE changing anything if your schema differs ----------
do $$
declare missing text := '';
begin
  if to_regclass('public.orders') is null then missing := missing || ' table orders;'; end if;
  if to_regclass('public.hoodie_inventory') is null then missing := missing || ' table hoodie_inventory;'; end if;
  if to_regclass('public.products') is null then missing := missing || ' table products;'; end if;
  if to_regclass('public.profiles') is null then missing := missing || ' table profiles;'; end if;
  if missing <> '' then raise exception 'AIRVER PRE-FLIGHT FAILED, missing:%', missing; end if;
  perform 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id';
  if not found then raise exception 'AIRVER PRE-FLIGHT FAILED: profiles has no "id" column (the admin policies below assume profiles.id = auth.uid() and profiles.role). Tell me your profiles columns.'; end if;
  perform 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role';
  if not found then raise exception 'AIRVER PRE-FLIGHT FAILED: profiles has no "role" column.'; end if;
  perform 1 from information_schema.columns where table_schema='public' and table_name='hoodie_inventory' and column_name in ('size','stock') having count(*)=2;
  if not found then raise exception 'AIRVER PRE-FLIGHT FAILED: hoodie_inventory must have columns size and stock.'; end if;
  perform 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('ref','name','phone','second_phone','address','maps_url','wilaya_code','wilaya_name','delivery','method','total','product','variant','product_type','items','status') having count(*)=16;
  if not found then raise exception 'AIRVER PRE-FLIGHT FAILED: orders is missing some of the columns the site writes (ref, name, phone, second_phone, address, maps_url, wilaya_code, wilaya_name, delivery, method, total, product, variant, product_type, items, status).'; end if;
end $$;

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. Prices & delivery fees (public read, admin write) ----------
create table if not exists public.site_prices (
  sku                 text primary key,
  price_cod           integer not null check (price_cod between 100 and 1000000),
  online_discount_pct integer not null default 5 check (online_discount_pct between 0 and 50)
);
insert into public.site_prices (sku, price_cod, online_discount_pct) values ('hoodie', 8900, 5)
on conflict (sku) do nothing;

create table if not exists public.shipping_rates (
  wilaya_code smallint primary key check (wilaya_code between 1 and 69),
  name        text    not null,
  home_fee    integer not null check (home_fee   >= 0),
  office_fee  integer not null check (office_fee >= 0)
);
-- !!! PLACEHOLDER RATES (800 home / 500 office everywhere). Replace with your delivery company's real
-- !!! prices before launch:  update public.shipping_rates set home_fee = 600, office_fee = 400 where wilaya_code = 16;
insert into public.shipping_rates (wilaya_code, name, home_fee, office_fee) values
    (1, 'Adrar', 800, 500),
    (2, 'Chlef', 800, 500),
    (3, 'Laghouat', 800, 500),
    (4, 'Oum El Bouaghi', 800, 500),
    (5, 'Batna', 800, 500),
    (6, 'Béjaïa', 800, 500),
    (7, 'Biskra', 800, 500),
    (8, 'Béchar', 800, 500),
    (9, 'Blida', 800, 500),
    (10, 'Bouira', 800, 500),
    (11, 'Tamanrasset', 800, 500),
    (12, 'Tébessa', 800, 500),
    (13, 'Tlemcen', 800, 500),
    (14, 'Tiaret', 800, 500),
    (15, 'Tizi Ouzou', 800, 500),
    (16, 'Algiers', 800, 500),
    (17, 'Djelfa', 800, 500),
    (18, 'Jijel', 800, 500),
    (19, 'Sétif', 800, 500),
    (20, 'Saïda', 800, 500),
    (21, 'Skikda', 800, 500),
    (22, 'Sidi Bel Abbès', 800, 500),
    (23, 'Annaba', 800, 500),
    (24, 'Guelma', 800, 500),
    (25, 'Constantine', 800, 500),
    (26, 'Médéa', 800, 500),
    (27, 'Mostaganem', 800, 500),
    (28, 'M''Sila', 800, 500),
    (29, 'Mascara', 800, 500),
    (30, 'Ouargla', 800, 500),
    (31, 'Oran', 800, 500),
    (32, 'El Bayadh', 800, 500),
    (33, 'Illizi', 800, 500),
    (34, 'Bordj Bou Arréridj', 800, 500),
    (35, 'Boumerdès', 800, 500),
    (36, 'El Taref', 800, 500),
    (37, 'Tindouf', 800, 500),
    (38, 'Tissemsilt', 800, 500),
    (39, 'El Oued', 800, 500),
    (40, 'Khenchela', 800, 500),
    (41, 'Souk Ahras', 800, 500),
    (42, 'Tipaza', 800, 500),
    (43, 'Mila', 800, 500),
    (44, 'Aïn Defla', 800, 500),
    (45, 'Naâma', 800, 500),
    (46, 'Aïn Témouchent', 800, 500),
    (47, 'Ghardaïa', 800, 500),
    (48, 'Relizane', 800, 500),
    (49, 'Timimoun', 800, 500),
    (50, 'Bordj Badji Mokhtar', 800, 500),
    (51, 'Ouled Djellal', 800, 500),
    (52, 'Béni Abbès', 800, 500),
    (53, 'In Salah', 800, 500),
    (54, 'In Guezzam', 800, 500),
    (55, 'Touggourt', 800, 500),
    (56, 'Djanet', 800, 500),
    (57, 'El M''Ghair', 800, 500),
    (58, 'El Meniaa', 800, 500),
    (59, 'Aflou', 800, 500),
    (60, 'Barika', 800, 500),
    (61, 'El Kantara', 800, 500),
    (62, 'Bir El Ater', 800, 500),
    (63, 'El Aricha', 800, 500),
    (64, 'Ksar Chellala', 800, 500),
    (65, 'Aïn Oussara', 800, 500),
    (66, 'Messaad', 800, 500),
    (67, 'Ksar El Boukhari', 800, 500),
    (68, 'Bou Saâda', 800, 500),
    (69, 'El Abiodh Sidi Cheikh', 800, 500)
on conflict (wilaya_code) do nothing;

alter table public.site_prices    enable row level security;
alter table public.shipping_rates enable row level security;
drop policy if exists "airver public read site_prices"    on public.site_prices;
drop policy if exists "airver public read shipping_rates" on public.shipping_rates;
create policy "airver public read site_prices"    on public.site_prices    for select to anon, authenticated using (true);
create policy "airver public read shipping_rates" on public.shipping_rates for select to anon, authenticated using (true);
drop policy if exists "airver admin write site_prices"    on public.site_prices;
drop policy if exists "airver admin write shipping_rates" on public.shipping_rates;
create policy "airver admin write site_prices"    on public.site_prices    for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "airver admin write shipping_rates" on public.shipping_rates for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---------- 2. Orders: new columns + lock-down ----------
alter table public.orders add column if not exists created_at   timestamptz not null default now();
alter table public.orders add column if not exists subtotal     integer;
alter table public.orders add column if not exists shipping_fee integer;
alter table public.orders add column if not exists ip_hash      text;
alter table public.orders add column if not exists payment_ref  text;
alter table public.orders add column if not exists paid_at      timestamptz;
alter table public.orders add column if not exists request_id   uuid;      -- idempotency: a retried request never creates a 2nd order

do $$ begin
  create unique index if not exists orders_ref_key on public.orders (ref);
exception when unique_violation then
  raise notice 'orders_ref_key not created: duplicate refs already exist (old 6-digit refs). Fix the duplicates, then re-run.';
end $$;
create unique index if not exists orders_request_id_key on public.orders (request_id) where request_id is not null;
create index if not exists orders_ip_recent      on public.orders (ip_hash, created_at desc);
create index if not exists orders_phone_recent   on public.orders (phone,   created_at desc);
create index if not exists orders_payment_ref_ix on public.orders (payment_ref);

alter table public.orders enable row level security;

-- Drop every wide-open policy (using true / check true) that anonymous visitors could use.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'hoodie_inventory', 'stock_reservations')
      and roles && array['anon', 'public']::name[]
      and coalesce(btrim(qual), 'true') = 'true'
      and coalesce(btrim(with_check), 'true') = 'true'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke all on public.orders           from anon;
revoke all on public.hoodie_inventory from anon;

-- Keep your dashboard working: admins (authenticated + profiles.role = 'admin') can manage orders & stock.
drop policy if exists "airver admin orders"    on public.orders;
drop policy if exists "airver admin inventory" on public.hoodie_inventory;
create policy "airver admin orders" on public.orders for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "airver admin inventory" on public.hoodie_inventory for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---------- 3. Stock: no fake holds; the public only sees a status per size ----------
drop table if exists public.stock_reservations;

create or replace view public.public_stock as
  select size,
         case when stock <= 0 then 'sold_out' when stock <= 3 then 'low' else 'ok' end as status
  from public.hoodie_inventory;
grant select on public.public_stock to anon, authenticated;

-- ---------- 4. Server-side order logic ----------
create or replace function public.gen_order_ref() returns text
language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 symbols, no 0/O/1/I
  b bytea := gen_random_bytes(8);
  s text := '';
  i int;
begin
  for i in 0..7 loop
    s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return '#AV-' || s;                                            -- ~40 bits, generated by the server
end $$;

create or replace function public.create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  c_status_cod    constant text := 'new';
  c_status_online constant text := 'pending_payment';
  v_method   text := p->>'method';
  v_delivery text := p->>'delivery';
  v_wilaya   int  := nullif(p->>'wilaya_code', '')::int;
  v_phone    text := p->>'phone';
  v_ip       text := nullif(p->>'ip_hash', '');
  v_rate     record;
  v_sp       record;
  v_pr       jsonb;
  it         record;
  v_items    jsonb := '[]'::jsonb;
  v_sizes    jsonb;
  v_unit     int;
  v_subtotal int := 0;
  v_ship     int;
  v_total    int;
  v_count    int := 0;
  v_hoodie_only boolean := true;
  v_variants text[] := '{}';
  v_ref      text;
  v_tries    int := 0;
  v_product  text;
  v_variant  text;
  v_ptype    text;
  v_status   text;
  v_req      uuid := nullif(p->>'request_id', '')::uuid;
  v_old      record;
begin
  -- idempotency: same request_id → return the order that already exists (no second order, no second stock decrement)
  if v_req is not null then
    select ref, total, subtotal, shipping_fee, status into v_old from public.orders where request_id = v_req;
    if found then
      return jsonb_build_object('ref', v_old.ref, 'total', v_old.total, 'subtotal', v_old.subtotal, 'shipping_fee', v_old.shipping_fee, 'status', v_old.status, 'duplicate', true);
    end if;
  end if;

  if v_method not in ('cod', 'online') then raise exception 'INVALID_METHOD'; end if;
  if v_delivery not in ('home', 'office') then raise exception 'INVALID_DELIVERY'; end if;

  -- anti-abuse (CGNAT mobile networks share IPs, so the per-IP limit is generous)
  if v_ip is not null and (select count(*) from public.orders where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 20
    then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '24 hours') >= 5
    then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from public.orders where phone = v_phone and status = c_status_online and created_at > now() - interval '45 minutes') >= 2
    then raise exception 'RATE_LIMIT'; end if;

  select * into v_rate from public.shipping_rates where wilaya_code = v_wilaya;
  if not found then raise exception 'INVALID_WILAYA'; end if;
  v_ship := case when v_delivery = 'home' then v_rate.home_fee else v_rate.office_fee end;

  for it in
    select * from jsonb_to_recordset(p->'items') as x(sku text, size text, qty int) order by sku, size
  loop
    v_count := v_count + 1;
    if it.sku = 'hoodie' then
      select * into v_sp from public.site_prices where sku = 'hoodie';
      if not found then raise exception 'NO_PRICE'; end if;
      v_unit := case when v_method = 'online'
                     then round(v_sp.price_cod * (100 - v_sp.online_discount_pct) / 100.0)::int
                     else v_sp.price_cod end;
      update public.hoodie_inventory set stock = stock - it.qty where size = it.size and stock >= it.qty;
      if not found then raise exception 'OUT_OF_STOCK:%', it.size; end if;
      v_items := v_items || jsonb_build_object('sku', 'hoodie', 'size', it.size, 'product', 'Vertex Hoodie',
                   'variant', 'Noir · ' || it.size, 'product_type', 'hoodie', 'qty', it.qty, 'price', v_unit);
      v_variants := v_variants || (it.size || case when it.qty > 1 then '×' || it.qty else '' end);
    else
      v_hoodie_only := false;
      if v_method = 'online' then raise exception 'ONLINE_HOODIE_ONLY'; end if;
      select to_jsonb(pr) into v_pr from public.products pr where pr.id::text = it.sku and pr.status = 'active';
      if v_pr is null then raise exception 'UNKNOWN_PRODUCT'; end if;
      v_sizes := v_pr->'sizes';
      if v_sizes is not null and jsonb_typeof(v_sizes) = 'array' and jsonb_array_length(v_sizes) > 0 then
        if not (v_sizes ? it.size) then raise exception 'INVALID_SIZE'; end if;
      end if;
      v_unit := round((v_pr->>'price')::numeric)::int;
      if v_unit is null or v_unit <= 0 then raise exception 'NO_PRICE'; end if;
      v_items := v_items || jsonb_build_object('sku', it.sku, 'size', it.size, 'product', v_pr->>'name',
                   'variant', it.size, 'product_type', coalesce(v_pr->>'product_type', 'other'), 'qty', it.qty, 'price', v_unit);
    end if;
    v_subtotal := v_subtotal + v_unit * it.qty;
  end loop;

  if v_count = 0 then raise exception 'EMPTY_CART'; end if;
  v_total := v_subtotal + v_ship;
  -- The page shows the customer a total; if the real price moved in the meantime, refuse instead of charging a different amount.
  -- (raising rolls back the stock decrements above: the whole call is one transaction)
  if nullif(p->>'expected_total', '') is not null and (p->>'expected_total')::int <> v_total then
    raise exception 'PRICE_CHANGED:%', v_total;
  end if;

  v_product := case when v_hoodie_only then 'Vertex Hoodie'
                    when v_count = 1 then v_items->0->>'product'
                    else 'Mixed order (' || v_count || ' items)' end;
  v_variant := case when v_hoodie_only then 'Noir · ' || array_to_string(v_variants, ', ')
                    else (select string_agg(x->>'variant', ', ') from jsonb_array_elements(v_items) x) end;
  v_ptype   := case when v_hoodie_only then 'hoodie'
                    when v_count = 1 then coalesce(v_items->0->>'product_type', 'other')
                    else 'other' end;
  v_status  := case when v_method = 'online' then c_status_online else c_status_cod end;

  loop
    v_ref := public.gen_order_ref();
    begin
      insert into public.orders (ref, name, phone, second_phone, address, maps_url, wilaya_code, wilaya_name, delivery, method,
                                 total, subtotal, shipping_fee, product, variant, product_type, items, status, ip_hash, request_id)
      values (v_ref, p->>'name', v_phone, nullif(p->>'second_phone', ''), p->>'address', nullif(p->>'maps_url', ''),
              v_wilaya, v_rate.name, v_delivery, v_method,
              v_total, v_subtotal, v_ship, v_product, v_variant, v_ptype, v_items, v_status, v_ip, v_req);
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 5 then raise exception 'REF_COLLISION'; end if;
    end;
  end loop;

  return jsonb_build_object('ref', v_ref, 'total', v_total, 'subtotal', v_subtotal, 'shipping_fee', v_ship, 'status', v_status);
end $$;

-- Gives an unpaid online order back to stock and cancels it (never touches paid / confirmed orders).
create or replace function public._release_order(p_ref text, p_reason text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare o record; it jsonb;
begin
  select * into o from public.orders where ref = p_ref for update;
  if not found or o.status <> 'pending_payment' or o.paid_at is not null then return false; end if;
  for it in select * from jsonb_array_elements(coalesce(o.items::jsonb, '[]'::jsonb)) loop
    if it->>'sku' = 'hoodie' then
      update public.hoodie_inventory set stock = stock + coalesce((it->>'qty')::int, 0) where size = it->>'size';
    end if;
  end loop;
  update public.orders set status = 'cancelled' where ref = p_ref;
  return true;
end $$;

create or replace function public.cancel_order(p_ref text, p_reason text default null) returns boolean
language sql security definer set search_path = public, extensions, pg_temp as $$
  select public._release_order(p_ref, p_reason);
$$;

create or replace function public.cancel_order_by_payment(p_payment_ref text, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_ref text;
begin
  select ref into v_ref from public.orders where payment_ref = p_payment_ref;
  if v_ref is null then return false; end if;
  return public._release_order(v_ref, p_reason);
end $$;

create or replace function public.attach_payment(p_ref text, p_payment_ref text) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update public.orders set payment_ref = p_payment_ref
  where ref = p_ref and status = 'pending_payment' and payment_ref is null;
$$;

-- Marks an online order as paid ONLY if the amount matches what the server computed.
create or replace function public.mark_order_paid(p_payment_ref text, p_amount int) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  c_status_paid constant text := 'new';   -- the status your dashboard treats as "confirmed new order"
  o record;
begin
  select * into o from public.orders where payment_ref = p_payment_ref for update;
  if not found then raise exception 'UNKNOWN_PAYMENT'; end if;
  if o.paid_at is not null then return 'already_paid'; end if;
  if o.total <> p_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  if o.status = 'cancelled' then
    update public.orders set status = c_status_paid, paid_at = now() where ref = o.ref;   -- paid after expiry: keep the money, flag for staff
    return 'paid_after_cancel';
  end if;
  update public.orders set status = c_status_paid, paid_at = now() where ref = o.ref;
  return 'paid';
end $$;

create or replace function public.expire_pending_orders() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select ref from public.orders where status = 'pending_payment' and paid_at is null and created_at < now() - interval '45 minutes' loop
    if public._release_order(r.ref, 'expired') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Only the service role (the Edge Functions) may run these. Visitors cannot call them.
revoke all on function public.gen_order_ref()                          from public, anon, authenticated;
revoke all on function public.create_order(jsonb)                      from public, anon, authenticated;
revoke all on function public._release_order(text, text)               from public, anon, authenticated;
revoke all on function public.cancel_order(text, text)                 from public, anon, authenticated;
revoke all on function public.cancel_order_by_payment(text, text)      from public, anon, authenticated;
revoke all on function public.attach_payment(text, text)               from public, anon, authenticated;
revoke all on function public.mark_order_paid(text, int)               from public, anon, authenticated;
revoke all on function public.expire_pending_orders()                  from public, anon, authenticated;
grant execute on function public.create_order(jsonb), public.cancel_order(text, text), public.cancel_order_by_payment(text, text),
                          public.attach_payment(text, text), public.mark_order_paid(text, int), public.expire_pending_orders()
  to service_role;

-- Optional: every 15 minutes, cancel & restock unpaid online orders (enable the pg_cron extension first).
-- select cron.schedule('airver-expire-orders', '*/15 * * * *', $$select public.expire_pending_orders()$$);

-- =====================================================================================
-- AFTER RUNNING
--  * Put your real delivery prices in shipping_rates (placeholders are 800 home / 500 office).
--  * Make sure hoodie_inventory holds your REAL stock (the order function now decrements it).
--    If your dashboard also decrements stock when you confirm an order, you would count twice: tell me.
--  * Check status words: the functions use 'new', 'pending_payment', 'cancelled'. If the orders table
--    has a CHECK constraint with other words, tell me and I adapt the three constants.
--  * Test the review flow (review_check_order / submit_review) once: they must be SECURITY DEFINER to
--    keep working now that anonymous visitors can no longer read `orders`.
-- =====================================================================================
