"""Policies page: opens from every entry point, tabs/drag/keyboard/history/scroll-lock behave."""
import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
res = []
def check(n, c, extra=''):
    res.append(bool(c)); print(('PASS' if c else 'FAIL'), '-', n, '' if c else extra)
def st(pg):
    return pg.evaluate("""()=>{const p=document.getElementById('policiesPage');const t=[...document.querySelectorAll('#ppTabs [role=tab]')];
      const th=document.querySelector('.pp-thumb').getBoundingClientRect(), sel=t.find(x=>x.getAttribute('aria-selected')==='true');
      const sr=sel.getBoundingClientRect();
      return {open:p.classList.contains('is-open'),vis:getComputedStyle(p).visibility,tab:sel.dataset.tab,panel:(document.querySelector('.pp-panel.is-active')||{dataset:{}}).dataset.panel,
        thumbCentered:Math.abs((th.left+th.width/2)-(sr.left+sr.width/2))<3,hash:location.hash,bodyOv:document.body.style.overflow,inert:p.inert,
        h1:(document.querySelector('.pp-panel.is-active h1')||{}).textContent,prevHidden:document.getElementById('ppPrev').hidden,nextHidden:document.getElementById('ppNext').hidden,
        overflowX:document.documentElement.scrollWidth>innerWidth, barOverflow:(()=>{const b=document.querySelector('.pp-bar');return b.scrollWidth>b.clientWidth+1})()}}""")
def boot(pg, hash_=''):
    pg.goto(URL + hash_); pg.wait_for_timeout(1500)
    pg.click('#entryGateSkip'); pg.wait_for_timeout(3800)
    try: pg.click('#cookieAcceptBtn', timeout=1200)
    except Exception: pass
with sync_playwright() as p:
    br = p.chromium.launch()
    for mobile, vp in ((False, {'width': 1280, 'height': 800}), (True, {'width': 390, 'height': 844}), (True, {'width': 360, 'height': 740})):
        tag = f"{'mobile' if mobile else 'desktop'} {vp['width']}"
        ctx = br.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        pg.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))")
        pg.route('**/rest/v1/**', lambda r: r.fulfill(json=[]))
        boot(pg)
        tap = (lambda sel: pg.tap(sel)) if mobile else (lambda sel: pg.click(sel))
        # 1. opens from the footer, on the right tab
        pg.evaluate("document.querySelector('.foot-policy-links [data-policy-tab=\"returns\"]').click()"); pg.wait_for_timeout(900)
        s = st(pg)
        check(f'[{tag}] footer link opens the full page on Returns', s['open'] and s['tab'] == 'returns' and s['panel'] == 'returns' and s['h1'].startswith('Returns'), s)
        check(f'[{tag}] thumb sits under the active tab; page scroll locked; URL = #policies-returns', s['thumbCentered'] and s['bodyOv'] == 'hidden' and s['hash'] == '#policies-returns', s)
        check(f'[{tag}] no horizontal overflow, top bar fits', not s['overflowX'] and not s['barOverflow'], s)
        pg.screenshot(path=f'/tmp/pol_{tag.replace(" ","_")}_returns.png')
        # 2. tabs
        tap('#pp-tab-terms'); pg.wait_for_timeout(900); s = st(pg)
        check(f'[{tag}] clicking Terms switches panel + thumb + hash', s['tab'] == 'terms' and s['panel'] == 'terms' and s['thumbCentered'] and s['hash'] == '#policies-terms' and s['nextHidden'] and not s['prevHidden'], s)
        tap('#ppPrev'); pg.wait_for_timeout(700); s = st(pg)
        check(f'[{tag}] "Previous" card goes to Privacy', s['tab'] == 'privacy', s)
        # 3. keyboard
        pg.focus('#pp-tab-privacy'); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(600); s = st(pg)
        check(f'[{tag}] ArrowLeft moves to Returns', s['tab'] == 'returns', s)
        pg.keyboard.press('Home'); pg.wait_for_timeout(500); check(f'[{tag}] Home moves to Shipping', st(pg)['tab'] == 'shipping')
        # 4. drag the droplet from Shipping to Privacy (mouse; touch uses same pointer events)
        tabs = pg.evaluate("[...document.querySelectorAll('#ppTabs [role=tab]')].map(b=>{const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})")
        pg.mouse.move(*tabs[0]); pg.mouse.down(); pg.mouse.move((tabs[0][0] + tabs[1][0]) / 2, tabs[0][1], steps=6); pg.wait_for_timeout(250)
        mid = pg.evaluate("[document.getElementById('ppTabs').className, document.querySelector('.pp-thumb').getBoundingClientRect().width]")
        pg.mouse.move(tabs[2][0], tabs[2][1], steps=8); pg.mouse.up(); pg.wait_for_timeout(900); s = st(pg)
        check(f'[{tag}] dragging the glass droplet selects Privacy (pressed state while dragging)', s['tab'] == 'privacy' and 'drag' in mid[0] and 'pr' in mid[0] and s['thumbCentered'], (mid, s))
        # 5. Esc closes, scroll lock released, hash cleared
        pg.keyboard.press('Escape'); pg.wait_for_timeout(900); s = st(pg)
        check(f'[{tag}] Escape closes; scroll unlocked; hash cleared; page inert', not s['open'] and s['bodyOv'] == '' and s['hash'] == '' and s['inert'], s)
        # 6. browser Back closes
        pg.evaluate("document.querySelector('.foot-policy-links [data-policy-tab=\"shipping\"]').click()"); pg.wait_for_timeout(700)
        pg.go_back(); pg.wait_for_timeout(900); s = st(pg)
        check(f'[{tag}] browser Back (phone swipe) closes the page and stays on the site', (not s['open']) and pg.url.startswith(URL.rstrip('/')) , (s, pg.url))
        # 7. Back button
        pg.evaluate("document.querySelector('.foot-policy-links [data-policy-tab=\"terms\"]').click()"); pg.wait_for_timeout(700)
        tap('#policiesBack'); pg.wait_for_timeout(900); s = st(pg)
        check(f'[{tag}] top-left Back closes it', not s['open'] and s['hash'] == '', s)
        # 8. opened from inside the product page: stacks above it and does not unlock the page when closed
        pg.evaluate("document.querySelector('#productCard').click()"); pg.wait_for_timeout(1800)
        pg.evaluate("document.querySelector('#productOverlay [data-policy-tab=\"shipping\"]').click()"); pg.wait_for_timeout(900)
        top = pg.evaluate("(()=>{const r=document.getElementById('policiesPage').getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+300);return !!e.closest('#policiesPage')})()")
        check(f'[{tag}] opened from the product page it is on top of it', top)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(900)
        check(f'[{tag}] closing it leaves the product page open and still scroll-locked', pg.evaluate("document.getElementById('productOverlay').classList.contains('is-open') && document.body.style.overflow==='hidden'"))
        pg.evaluate("document.getElementById('overlayClose').click()"); pg.wait_for_timeout(700)
        check(f'[{tag}] after closing the product page scrolling is unlocked', pg.evaluate("document.body.style.overflow===''"))
        check(f'[{tag}] no script errors / CSP violations', not errs and pg.evaluate('window.__csp.length') == 0, (errs, pg.evaluate('window.__csp')))
        # 9. deep link
        pg2 = ctx.new_page(); pg2.route('**/rest/v1/**', lambda r: r.fulfill(json=[]))
        pg2.add_init_script("window.__csp=[]")
        boot(pg2, '#policies-privacy'); s = st(pg2)
        check(f'[{tag}] direct link #policies-privacy opens Privacy', s['open'] and s['tab'] == 'privacy', s)
        ctx.close()
    br.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
