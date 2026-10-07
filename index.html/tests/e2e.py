"""End-to-end test of the patched Airver site with a fake backend (no real Supabase / Turnstile / Chargily)."""
import json, re, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8120/'
STOCK = [{'size': 'S', 'status': 'ok'}, {'size': 'M', 'status': 'low'}, {'size': 'L', 'status': 'sold_out'}, {'size': 'XL', 'status': 'ok'}]
RATES = [{'wilaya_code': 16, 'home_fee': 600, 'office_fee': 400}, {'wilaya_code': 31, 'home_fee': 800, 'office_fee': 500}, {'wilaya_code': 1, 'home_fee': 1200, 'office_fee': 900}]
EVIL_PRODUCT = {'id': '11111111-1111-1111-1111-111111111111', 'name': 'Evil <b>Tee</b>', 'price': 3000, 'status': 'active', 'sizes': ['M'], 'images': ['x" onerror="window.__xss=1" data-x="'], 'description': 'd', 'product_type': 'tee'}
TS_STUB = "window.__tsn=0;window.turnstile={render:function(sel,o){window.__tsopts=o;return 'w1'},execute:function(){setTimeout(function(){window.__tsopts.callback('ts-token-'+(++window.__tsn))},20)},reset:function(){}};"
results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), '-', name, extra if not cond else '')

def run(mobile=True):
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); errs = []; reqs = []; state = {'mode': 'ok', 'orders': []}; nav = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
        pg.on('console', lambda m: errs.append('console:' + m.text[:140]) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.on('request', lambda r: reqs.append(r.url))
        def rest(route):
            u = route.request.url
            if '/rest/v1/public_stock' in u: return route.fulfill(json=STOCK)
            if '/rest/v1/shipping_rates' in u: return route.fulfill(json=RATES)
            if '/rest/v1/products' in u: return route.fulfill(json=[EVIL_PRODUCT])
            if '/rest/v1/public_reviews' in u: return route.fulfill(json=[])
            if '/rest/v1/rpc/review_check_order' in u:
                state['review_ref'] = json.loads(route.request.post_data)['p_ref']; return route.fulfill(json={'status': 'not_found'})
            return route.fulfill(status=404, json={'message': 'nope'})
        def cors(route):
            h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
            if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=h)
            body = json.loads(route.request.post_data); state['orders'].append(body); m = state['mode']
            if m == 'network' and state.pop('drop_next', False): return route.abort()
            if m in ('OUT_OF_STOCK', 'RATE_LIMIT', 'CAPTCHA_FAILED', 'PRICE_CHANGED'):
                extra = {'size': 'M'} if m == 'OUT_OF_STOCK' else ({'total': 9999} if m == 'PRICE_CHANGED' else {})
                return route.fulfill(status={'OUT_OF_STOCK': 409, 'RATE_LIMIT': 429, 'CAPTCHA_FAILED': 403, 'PRICE_CHANGED': 409}[m], headers=h, json={'error': m, **extra})
            fee = {16: (600, 400), 31: (800, 500), 1: (1200, 900)}[body['wilaya_code']][0 if body['delivery'] == 'home' else 1]
            unit = 8455 if body['method'] == 'online' else 8900
            qty = sum(i['qty'] for i in body['items'] if i['sku'] == 'hoodie')
            res = {'ref': '#AV-K7M2QX9P', 'subtotal': unit * qty, 'shipping_fee': fee, 'total': unit * qty + fee}
            if body['method'] == 'online': res['checkout_url'] = state.get('checkout', 'https://pay.chargily.dz/test/checkouts/ck_1/pay')
            return route.fulfill(headers=h, json=res)
        pg.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',function(e){window.__csp.push(e.violatedDirective+' '+e.blockedURI)})")
        pg.route('**/rest/v1/**', rest); pg.route('**/functions/v1/create-order', cors)
        pg.route('https://challenges.cloudflare.com/**', lambda r: r.fulfill(body=TS_STUB, content_type='text/javascript'))
        pg.route('https://pay.chargily.dz/**', lambda r: (nav.append(r.request.url), r.fulfill(body='<html>chargily</html>', content_type='text/html')))
        pg.route('https://evil.example/**', lambda r: (nav.append(r.request.url), r.fulfill(body='<html>evil</html>', content_type='text/html')))

        def boot():
            pg.goto(URL); pg.wait_for_timeout(1500); pg.tap('#entryGateSkip'); pg.wait_for_timeout(3500)
            try: pg.tap('#cookieAcceptBtn', timeout=1200)
            except Exception: pass
        def open_product_and_size(size='M'):
            pg.evaluate("document.querySelector('#productCard').click()"); pg.wait_for_timeout(1800)
            pg.tap(f'#sizes .size-btn[data-size="{size}"]'); pg.wait_for_timeout(500)
        def fill_details(wil_query='Algiers', delivery='office', online=False):
            pg.tap('#orderNowBtn'); pg.wait_for_timeout(1300)
            if online: pg.tap('#sheetOptionOnline'); pg.wait_for_timeout(300)
            pg.tap('#paymentMethodContinueBtn'); pg.wait_for_timeout(900)
            pg.fill('#inputName', 'Sara Haddad'); pg.fill('#inputPhone', '0661234567'); pg.tap('#detailsNextBtn'); pg.wait_for_timeout(900)
            pg.tap('#deliveryOffice' if delivery == 'office' else '#deliveryHome'); pg.wait_for_timeout(500)
            pg.tap('#inputWilayaBtn'); pg.wait_for_timeout(500); pg.fill('#wilayaSearch', wil_query); pg.wait_for_timeout(300)
            pg.tap('.wilaya-item >> nth=0'); pg.wait_for_timeout(500)
            pg.fill('#inputAddress', 'Rue 12, Bir El Djir')

        boot()
        check('page boots without script errors', not errs, errs[:3])
        check('no third-party library requested (jsdelivr / supabase-js)', not any('jsdelivr' in u for u in reqs))
        check('browser never asked for the removed reservations table', not any('stock_reservations' in u for u in reqs))
        # stock
        pg.evaluate("document.querySelector('#productCard').click()"); pg.wait_for_timeout(1800)
        check('sold-out size (L) is disabled', pg.evaluate("document.querySelector('#sizes .size-btn[data-size=\"L\"]').disabled"))
        pg.tap('#sizes .size-btn[data-size="M"]'); pg.wait_for_timeout(400)
        check('low-stock note shown for M', 'Low stock' in pg.inner_text('.size-cell-note[data-note-for="M"]'))
        check('no fake "Reserved" countdown', 'Reserved' not in pg.inner_text('body'))
        # XSS
        check('catalog image URL cannot inject attributes (no XSS)', pg.evaluate("window.__xss===undefined && !document.querySelector('img[onerror]')"))
        pg.evaluate("document.querySelector('#productOverlay .overlay-close, #overlayBack, .overlay-back')&&0")
        # COD happy path
        fill_details('Algiers', 'office')
        summary = pg.inner_text('#summaryPrice') + ' | ' + pg.inner_text('#summaryShip')
        check('summary shows product + office delivery for Alger = 9 300 DA', '9 300 DA' in summary and '400 DA' in summary, summary)
        pg.tap('#deliveryHome'); pg.wait_for_timeout(500)
        check('switching to home delivery updates total to 9 500 DA', '9 500 DA' in pg.inner_text('#summaryPrice'), pg.inner_text('#summaryPrice'))
        pg.tap('#deliveryOffice'); pg.wait_for_timeout(400)
        pg.tap('#detailsSubmitBtn'); pg.wait_for_timeout(1500)
        o = state['orders'][-1] if state['orders'] else {}
        check('order request sent to create-order', len(state['orders']) == 1)
        check('request has NO price/total/ref/status fields', not any(k in o for k in ('total', 'totalNum', 'price', 'ref', 'status', 'subtotal')), list(o))
        check('items are sku/size/qty only', o.get('items') == [{'sku': 'hoodie', 'size': 'M', 'qty': 1}], o.get('items'))
        check('expected_total is a display check (9300) + request_id uuid + captcha token', o.get('expected_total') == 9300 and re.match(r'^[0-9a-f-]{36}$', o.get('request_id', '')) and o.get('turnstile_token', '').startswith('ts-token'), (o.get('expected_total'), o.get('request_id')))
        check('delivery/wilaya sent as codes', o.get('delivery') == 'office' and o.get('wilaya_code') == 16 and o.get('method') == 'cod')
        body = pg.inner_text('#reviewModal') if pg.query_selector('#reviewModal') else pg.inner_text('body')
        check('confirmation shows the SERVER reference and total', 'AV-K7M2QX9P' in body and '9 300 DA' in body and 'Delivery fee' in body, body[:300])
        pg.reload(); pg.wait_for_timeout(1200)

        # errors + idempotency
        boot(); open_product_and_size('S')
        for mode, text in [('OUT_OF_STOCK', 'sold out'), ('RATE_LIMIT', 'Too many'), ('CAPTCHA_FAILED', 'security check'), ('PRICE_CHANGED', '9 999 DA')]:
            state['mode'] = mode
            if mode == 'OUT_OF_STOCK':
                fill_details('Oran', 'home')
            pg.tap('#detailsSubmitBtn'); pg.wait_for_timeout(1300)
            check(f'{mode}: friendly message', text.lower() in pg.inner_text('#orderErrorBanner').lower(), pg.inner_text('#orderErrorBanner'))
        state['mode'] = 'network'; state['drop_next'] = True; n0 = len(state['orders'])
        pg.tap('#detailsSubmitBtn'); pg.wait_for_timeout(3500)
        new = state['orders'][n0:]
        check('network drop: retried once with the SAME request_id (idempotent)', len(new) == 2 and new[0]['request_id'] == new[1]['request_id'], [x.get('request_id') for x in new])
        check('retry fetched a fresh captcha token', len(new) == 2 and new[0]['turnstile_token'] != new[1]['turnstile_token'])
        check('network drop then success shows confirmation', 'AV-K7M2QX9P' in pg.inner_text('body'))
        pg.reload(); pg.wait_for_timeout(800)
        # online
        state['mode'] = 'ok'; boot(); open_product_and_size('S'); fill_details('Oran', 'home', online=True)
        pg.tap('#detailsSubmitBtn'); pg.wait_for_timeout(1000)
        pg.tap('#payBtn'); pg.wait_for_timeout(2500)
        o = state['orders'][-1]
        check('online order: method=online, server decides amount, redirect to Chargily', o['method'] == 'online' and 'total' not in o and any('chargily.dz' in u for u in nav), (o['method'], nav))
        pg.goto(URL); pg.wait_for_timeout(1000)
        state['checkout'] = 'https://evil.example/pay'; nav.clear(); boot(); open_product_and_size('S'); fill_details('Oran', 'home', online=True)
        pg.tap('#detailsSubmitBtn'); pg.wait_for_timeout(1000); pg.tap('#payBtn'); pg.wait_for_timeout(2000)
        check('a checkout link NOT on chargily.dz/.net is never followed', not nav, nav)
        check('...and the customer sees an error', 'unavailable' in pg.inner_text('#paymentErrorBanner').lower(), pg.inner_text('#paymentErrorBanner'))
        # review number format
        pg.goto(URL); pg.wait_for_timeout(1000)
        has_rw = pg.query_selector('#rwRef') is not None
        if has_rw:
            pg.evaluate("document.getElementById('rwRef').value='av-k7m2qx9p';document.getElementById('rwPhone').value='0661234567';document.getElementById('rwVerifyForm').requestSubmit()"); pg.wait_for_timeout(800)
            check('review form accepts new AV-XXXXXXXX numbers (uppercased)', state.get('review_ref') == 'AV-K7M2QX9P', state.get('review_ref'))
        check('no script errors during the whole run', not errs, errs[:4])
        pg.goto(URL); pg.wait_for_timeout(800)  # CSPV
        check('no Content-Security-Policy violations on a fresh load', pg.evaluate('window.__csp.length') == 0, pg.evaluate('window.__csp'))
        br.close()
run(True)
bad = [n for n, ok in results if not ok]
print(f'\n{len(results)-len(bad)}/{len(results)} checks passed'); sys.exit(1 if bad else 0)
