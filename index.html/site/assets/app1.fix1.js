(function(){var l=document.getElementById('gf');if(!l)return;function on(){l.media='all'}if(l.sheet){on()}else{l.addEventListener('load',on);l.addEventListener('error',on)}})();
const nav = document.getElementById('nav');

  // ---- Bottom-up scroll reveal engine ----
  // card-sticky is a plain sticky section that stays pinned once reached — it's only
  // "let go" by the NEXT section's z-index sliding up to cover it, so there's no gap
  // where nothing is happening.
  //
  // Progress is driven by scrollY against the section's precomputed natural offset, updated
  // on a continuous rAF loop rather than the scroll event. Re-reading a sticky element's own
  // rect on every scroll event was the cause of the visible shake on fast scrolls: it mixes
  // main-thread scroll-event timing with the browser's own compositor-driven sticky timing,
  // and the two fall very slightly out of sync. offsetTop (a sticky element's position as if
  // it were static) plus plain scrollY avoids touching sticky layout at all during scroll.
  const cardSticky = document.getElementById('cardSticky');
  const cardIntro = document.getElementById('cardIntro');

  let cardStickyTop = 0;
  function measureSectionOffsets(){
    cardStickyTop = cardSticky.offsetTop;
  }
  function progressFromTop(sectionTop){
    const vh = window.innerHeight;
    return Math.min(1, Math.max(0, 1 - (sectionTop - window.scrollY) / vh));
  }
  function fadeText(el, progress, start, end){
    const t = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    el.style.opacity = t;
    el.style.transform = `translateY(${(1 - t) * 14}px)`;
  }

  function renderReveals(){
    const cp = progressFromTop(cardStickyTop);
    fadeText(cardIntro, cp, 0.3, 0.7);

    // Nav goes dark/glass the moment the white panel starts covering the hero layer.
    nav.classList.toggle('is-dark', cp > 0.02);

    const y = window.scrollY;
    if (y !== revealLastY) { revealLastY = y; revealIdle = 0; }
    else if (++revealIdle > 40) { revealRunning = false; return; }
    requestAnimationFrame(renderReveals);
  }
  let revealLastY = -1, revealIdle = 0, revealRunning = false;
  function wakeReveals() {
    revealIdle = 0;
    if (!revealRunning) { revealRunning = true; requestAnimationFrame(renderReveals); }
  }
  measureSectionOffsets();
  window.addEventListener('resize', () => { measureSectionOffsets(); wakeReveals(); });
  window.addEventListener('load', () => { measureSectionOffsets(); wakeReveals(); });
  ['scroll', 'touchstart', 'touchmove', 'wheel', 'keydown'].forEach(t => window.addEventListener(t, wakeReveals, { passive: true }));
  wakeReveals();

  // Reveal-on-scroll for plain fade-up elements (used inside the product overlay)
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = (i * 0.05) + 's';
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));

  // Product card -> opens its own full-screen page with just the product details.
  // Body scroll is locked while it's open, and restored on close.
  const productCard = document.getElementById('productCard');
  const overlay = document.getElementById('productOverlay');
  const overlayClose = document.getElementById('overlayClose');
  const overlayLoader = document.getElementById('overlayLoader');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let savedScrollY = 0;
  let overlayLoadTimer = null;
  function openOverlay(){
    savedScrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Small floating logo badge, reusing the hero wing-close motion (played twice),
    // over the page itself — replayed every time the product page is entered.
    overlay.scrollTop = 0;
    clearTimeout(overlayLoadTimer);
    overlay.classList.remove('is-loaded');
    if (prefersReducedMotion){
      overlay.classList.add('is-loaded');
    } else {
      overlayLoader.innerHTML = '';
      const chip = document.createElement('div');
      chip.className = 'loader-chip';
      chip.appendChild(document.querySelector('.hero-mark').cloneNode(true));
      overlayLoader.appendChild(chip);
      overlayLoadTimer = setTimeout(() => overlay.classList.add('is-loaded'), 1800);
    }

    overlay.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + 'px';
  }
  function closeOverlay(){
    overlay.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    window.scrollTo(0, savedScrollY);
    stopReservationCountdown();
    activeReservationExpiresAt = null;
    releaseActiveReservation();
  }
  productCard.addEventListener('click', openOverlay);
  // productCard is a div (role="button") now, not a native <button>, since a real
  // <button> can't contain the quick-add button below it — so Enter/Space need wiring by hand.
  productCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOverlay(); }
  });
  // Quick add from the rail: a small glass size picker next to the cart chip. Choosing a size adds
  // the hoodie to the cart in that size, without leaving the page.
  (function setupQuickPicker(){
    const qa = document.getElementById('quickAddBtn');
    if (!qa) return;
    const st = document.createElement('style');
    st.textContent =
      '.qp{position:fixed; z-index:400; width:208px; padding:14px 14px 12px; border-radius:18px; background:rgba(255,255,255,.78);' +
      '-webkit-backdrop-filter:blur(22px) saturate(1.6); backdrop-filter:blur(22px) saturate(1.6); border:1px solid rgba(255,255,255,.85);' +
      'box-shadow:0 18px 44px -12px rgba(30,24,10,.28), 0 1px 0 rgba(255,255,255,.9) inset; opacity:0; transform:translateY(-6px) scale(.97);' +
      'transform-origin:100% 0; transition:opacity .22s ease, transform .28s cubic-bezier(.2,.8,.2,1); font-family:inherit; color:#141414;}' +
      '.qp.is-in{opacity:1; transform:none;}' +
      '.qp-h{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:#8a857b;}' +
      '.qp-x{appearance:none; border:0; background:none; cursor:pointer; padding:2px; color:#8a857b; line-height:0;}' +
      '.qp-x svg{width:11px; height:11px; stroke:currentColor;}' +
      '.qp-sizes{display:grid; grid-template-columns:repeat(4,1fr); gap:7px;}' +
      '.qp-s{appearance:none; height:40px; border-radius:12px; border:1px solid rgba(20,20,20,.14); background:rgba(255,255,255,.7); font:inherit; font-size:13px; font-weight:600; color:#141414; cursor:pointer;' +
      'transition:background .18s, color .18s, border-color .18s, transform .15s; -webkit-tap-highlight-color:transparent;}' +
      '.qp-s:hover{background:#141414; color:#fff; border-color:#141414;}' +
      '.qp-s:active{transform:scale(.95);}' +
      '.qp-s:disabled{opacity:.35; text-decoration:line-through; cursor:not-allowed; background:transparent; color:#141414;}' +
      '.qp-s:disabled:hover{background:transparent; color:#141414; border-color:rgba(20,20,20,.14);}' +
      '.qp-ok{display:flex; align-items:center; justify-content:center; gap:8px; height:40px; font-size:13px; font-weight:600;}' +
      '.qp-ok svg{width:16px; height:16px; stroke:#1f8a4c;}';
    document.head.appendChild(st);
    let pop = null, tidy = null;
    function closePicker(){
      if (!pop) return;
      const p = pop; pop = null;
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', closePicker, true);
      clearTimeout(tidy);
      p.classList.remove('is-in');
      setTimeout(() => p.remove(), 260);
    }
    function onOutside(e){ if (pop && !pop.contains(e.target) && !qa.contains(e.target)) closePicker(); }
    function onKey(e){ if (e.key === 'Escape') closePicker(); }
    function sourceFrame(){
      const frames = Array.from(productCard.querySelectorAll('.rail-frame'));
      let best = frames[0];
      frames.forEach(f => { if (parseFloat(f.style.opacity || 0) > parseFloat((best && best.style.opacity) || 0)) best = f; });
      return best;
    }
    function openPicker(){
      closePicker();
      pop = document.createElement('div');
      pop.className = 'qp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose size');
      const sizes = ['S', 'M', 'L', 'XL'];
      pop.innerHTML =
        '<div class="qp-h"><span>Choose size</span><button type="button" class="qp-x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>' +
        '<div class="qp-sizes">' + sizes.map(z => '<button type="button" class="qp-s" data-size="' + z + '"' + (stockStatus[z] === 'sold_out' ? ' disabled' : '') + '>' + z + '</button>').join('') + '</div>';
      document.body.appendChild(pop);
      const r = qa.getBoundingClientRect(), w = 208, m = 12;
      let left = Math.min(Math.max(r.right - w, m), window.innerWidth - w - m);
      let top = r.bottom + 10;
      if (top + 130 > window.innerHeight - m) top = Math.max(m, r.top - 10 - 100);
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
      pop.style.transformOrigin = ((r.right - left)) + 'px 0';
      requestAnimationFrame(() => pop && pop.classList.add('is-in'));
      pop.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (ev.target.closest('.qp-x')) { closePicker(); return; }
        const b = ev.target.closest('.qp-s'); if (!b || b.disabled) return;
        addToCart(b.dataset.size, 1);
        flyToCart(sourceFrame());
        pop.querySelector('.qp-sizes').outerHTML = '<div class="qp-ok"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span>Added to cart</span></div>';
        pop.querySelector('.qp-h span').textContent = 'Size ' + b.dataset.size;
        tidy = setTimeout(closePicker, 1100);
      });
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', closePicker, true);
    }
    qa.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (pop) closePicker(); else openPicker();
    });
  })();
  overlayClose.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeOverlay();
  });

  // heroHeight is reused by the "Done" button on the thank-you modal to scroll back
  // down to the product grid right after the hero.
  const heroHeight = document.querySelector('.hero').offsetHeight;

  // Image viewer: vertical carousel driven by the up/down buttons.
  // Images are stacked absolutely; the incoming one is placed instantly at the edge it
  // should enter from (no transition), then both old and new animate together so the
  // outgoing image slides off one way while the incoming one slides in from the other.
  const viewerImgs = Array.from(document.querySelectorAll('#viewer img'));
  const viewerCount = document.getElementById('viewerCount');
  let currentImgIdx = 0;

  viewerImgs.forEach((img, i) => {
    img.style.transform = `translateY(${i === 0 ? 0 : 100}%)`;
    img.style.opacity = i === 0 ? '1' : '0';
  });
  function updateViewerCount(){
    if (viewerCount) viewerCount.textContent = `${currentImgIdx + 1}/${viewerImgs.length}`;
  }
  updateViewerCount();

  function goToImage(newIdx, direction){
    if (newIdx === currentImgIdx || !viewerImgs.length) return;
    const oldImg = viewerImgs[currentImgIdx];
    const newImg = viewerImgs[newIdx];

    viewerImgs.forEach((img, i) => {
      if (i !== currentImgIdx && i !== newIdx){
        img.style.transition = 'none';
        img.style.transform = 'translateY(100%)';
        img.style.opacity = '0';
      }
    });

    newImg.style.transition = 'none';
    newImg.style.transform = `translateY(${direction > 0 ? 100 : -100}%)`;
    newImg.style.opacity = '0';
    void newImg.offsetHeight;

    const anim = 'transform .55s cubic-bezier(.22,.61,.36,1), opacity .45s ease';
    oldImg.style.transition = anim;
    newImg.style.transition = anim;
    oldImg.style.transform = `translateY(${direction > 0 ? -100 : 100}%)`;
    oldImg.style.opacity = '0';
    newImg.style.transform = 'translateY(0%)';
    newImg.style.opacity = '1';

    currentImgIdx = newIdx;
    updateViewerCount();
  }

  document.getElementById('viewerDown').addEventListener('click', () => {
    goToImage((currentImgIdx + 1) % viewerImgs.length, 1);
  });
  document.getElementById('viewerUp').addEventListener('click', () => {
    goToImage((currentImgIdx - 1 + viewerImgs.length) % viewerImgs.length, -1);
  });

  // Size selector
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      reserveSize(btn.dataset.size || btn.textContent.trim());
    });
  });

  // Quantity stepper (product page)
  let currentQty = 1;
  const qtyValueEl = document.getElementById('qtyValue');
  document.getElementById('qtyPlus').addEventListener('click', () => {
    currentQty = Math.min(currentQty + 1, 10);
    qtyValueEl.textContent = String(currentQty);
  });
  document.getElementById('qtyMinus').addEventListener('click', () => {
    currentQty = Math.max(currentQty - 1, 1);
    qtyValueEl.textContent = String(currentQty);
  });

  // --- CUSTOM CHECKOUT & PAYMENT LOGIC ---
  // Dynamically inject spinner keyframes
  const spinnerStyle = document.createElement('style');
  spinnerStyle.textContent = `
    @keyframes rotate { 100% { transform: rotate(360deg); } }
    @keyframes dash {
      0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
      50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
      100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
    }
  `;
  document.head.appendChild(spinnerStyle);

  const checkoutBottomSheet = document.getElementById('checkoutBottomSheet');
  const checkoutBackdrop = document.getElementById('checkoutBackdrop');
  const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
  const closeCheckoutIcon = document.getElementById('closeCheckoutIcon');
  const addBtn = document.getElementById('addBtn');
  const detailsForm = document.getElementById('detailsForm');
  const paymentForm = document.getElementById('paymentForm');

  const stepDetails = document.getElementById('stepDetails');
  const stepPayment = document.getElementById('stepPayment');

  const checkoutSheetTitle = document.getElementById('checkoutSheetTitle');
  const summaryPrice = document.getElementById('summaryPrice');
  const summaryTitle = document.getElementById('summaryTitle');
  const summaryMethod = document.getElementById('summaryMethod');
  const summaryPrice2 = document.getElementById('summaryPrice2');
  const summaryTitle2 = document.getElementById('summaryTitle2');
  const detailsSubmitBtnText = document.getElementById('detailsSubmitBtnText');

  const wilayaModal = document.getElementById('wilayaModal');
  const wilayaBackdrop = document.getElementById('wilayaBackdrop');
  const wilayaClose = document.getElementById('wilayaClose');
  const wilayaList = document.getElementById('wilayaList');
  const wilayaSearch = document.getElementById('wilayaSearch');
  const inputWilayaBtn = document.getElementById('inputWilayaBtn');
  const inputWilayaLabel = document.getElementById('inputWilayaLabel');

  const addressLabel = document.getElementById('addressLabel');
  const deliveryTabs = document.getElementById('deliveryTabs');
  const deliveryThumb = document.getElementById('deliveryThumb');
  const deliveryHome = document.getElementById('deliveryHome');
  const deliveryOffice = document.getElementById('deliveryOffice');

  const reviewModal = document.getElementById('reviewModal');
  const reviewBody = document.getElementById('reviewBody');
  const reviewRef = document.getElementById('reviewRef');
  const mapsInput = document.getElementById('inputMapsLink');
  const copyMapsBtn = document.getElementById('copyMapsBtn');
  const saveImageBtn = document.getElementById('saveImageBtn');
  const reviewOkBtn = document.getElementById('reviewOkBtn');
  const thanksModal = document.getElementById('thanksModal');
  const thanksDoneBtn = document.getElementById('thanksDoneBtn');

  const WILAYAS = [
    [1,'Adrar','أدرار'],[2,'Chlef','الشلف'],[3,'Laghouat','الأغواط'],[4,'Oum El Bouaghi','أم البواقي'],
    [5,'Batna','باتنة'],[6,'Béjaïa','بجاية'],[7,'Biskra','بسكرة'],[8,'Béchar','بشار'],
    [9,'Blida','البليدة'],[10,'Bouira','البويرة'],[11,'Tamanrasset','تمنراست'],[12,'Tébessa','تبسة'],
    [13,'Tlemcen','تلمسان'],[14,'Tiaret','تيارت'],[15,'Tizi Ouzou','تيزي وزو'],[16,'Algiers','الجزائر'],
    [17,'Djelfa','الجلفة'],[18,'Jijel','جيجل'],[19,'Sétif','سطيف'],[20,'Saïda','سعيدة'],
    [21,'Skikda','سكيكدة'],[22,'Sidi Bel Abbès','سيدي بلعباس'],[23,'Annaba','عنابة'],[24,'Guelma','قالمة'],
    [25,'Constantine','قسنطينة'],[26,'Médéa','المدية'],[27,'Mostaganem','مستغانم'],[28,"M'Sila",'المسيلة'],
    [29,'Mascara','معسكر'],[30,'Ouargla','ورقلة'],[31,'Oran','وهران'],[32,'El Bayadh','البيض'],
    [33,'Illizi','إليزي'],[34,'Bordj Bou Arréridj','برج بوعريريج'],[35,'Boumerdès','بومرداس'],[36,'El Taref','الطارف'],
    [37,'Tindouf','تندوف'],[38,'Tissemsilt','تيسمسيلت'],[39,'El Oued','الوادي'],[40,'Khenchela','خنشلة'],
    [41,'Souk Ahras','سوق أهراس'],[42,'Tipaza','تيبازة'],[43,'Mila','ميلة'],[44,'Aïn Defla','عين الدفلى'],
    [45,'Naâma','النعامة'],[46,'Aïn Témouchent','عين تموشنت'],[47,'Ghardaïa','غرداية'],[48,'Relizane','غليزان'],
    [49,'Timimoun','تيميمون'],[50,'Bordj Badji Mokhtar','برج باجي مختار'],[51,'Ouled Djellal','أولاد جلال'],[52,'Béni Abbès','بني عباس'],
    [53,'In Salah','عين صالح'],[54,'In Guezzam','عين قزام'],[55,'Touggourt','تقرت'],[56,'Djanet','جانت'],
    [57,"El M'Ghair",'المغير'],[58,'El Meniaa','المنيعة'],
    [59,'Aflou','أفلو'],[60,'Barika','بريكة'],[61,'El Kantara','القنطرة'],[62,'Bir El Ater','بئر العاتر'],
    [63,'El Aricha','العريشة'],[64,'Ksar Chellala','قصر الشلالة'],[65,'Aïn Oussara','عين وسارة'],[66,'Messaad','مسعد'],
    [67,'Ksar El Boukhari','قصر البخاري'],[68,'Bou Saâda','بوسعادة'],[69,'El Abiodh Sidi Cheikh','الأبيض سيدي الشيخ']
  ];

  const PRICE_COD = '8 900 DA';
  const PRICE_ONLINE = '8 455 DA';
  const PRICE_COD_NUM = 8900;
  const PRICE_ONLINE_NUM = 8455; // exactly 5% off PRICE_COD_NUM

  // ---- Entry gate: asked once ever (localStorage, not sessionStorage) --------------------
  // Locks scroll itself rather than calling setBodyLock: that function reads a variable
  // (bodyLockScrollY) declared further down the script, which doesn't exist yet this early
  // in the page's very first synchronous pass — calling it here threw and silently killed
  // the rest of this IIFE, including the click listener below it.
  (function () {
    const gate = document.getElementById('entryGate');
    if (!gate) { document.documentElement.classList.remove('gate-pending'); return; }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    function dismissGate() {
      gate.classList.add('is-hidden');
      // start the hero intro once the gate is mostly faded, so it is seen from its first frame
      setTimeout(() => document.documentElement.classList.remove('gate-pending'), 400);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      setTimeout(() => { gate.style.display = 'none'; }, 750);
    }
    document.getElementById('entryGateOptions').addEventListener('click', (e) => {
      const btn = e.target.closest('.entry-gate-option');
      if (!btn) return;
      const optionsEl = document.getElementById('entryGateOptions');
      document.querySelectorAll('.entry-gate-option').forEach(el => el.classList.remove('is-chosen'));
      btn.classList.add('is-chosen');
      optionsEl.classList.add('has-chosen');
      localStorage.setItem('airverEntryChoice', btn.dataset.choice);
      setTimeout(dismissGate, 950); // long enough to actually see the green pulse + checkmark land
    });
    document.getElementById('entryGateSkip').addEventListener('click', () => {
      localStorage.setItem('airverEntryChoice', 'skipped');
      dismissGate();
    });
  })();

  // ---- Supabase: sends every finalized order to the staff dashboard ----
  var SUPABASE_URL = 'https://xmyojdmoyuhqfsfwwlqe.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_NhKQNBI9kIl5mN0jNqlSig_EhVQMLJJ';
  // ---- Backend access (hardened) ----------------------------------------------------------
  // The browser only READS public data (catalog, reviews, stock status, delivery rates) with the
  // public key. It can NOT write orders: orders go through the create-order Edge Function
  // (captcha + server-side pricing + stock + rate limits). No third-party library is loaded.
  // TODO: replace with your real Cloudflare Turnstile SITE key. The value below is Cloudflare's
  // always-pass TEST key; with your real secret on the server it simply makes orders fail, never pass.
  var TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
  var CREATE_ORDER_URL = SUPABASE_URL + '/functions/v1/create-order';
  function makeSb(url, key) {
    var H = { apikey: key, Authorization: 'Bearer ' + key };
    function fail(e) { return { data: null, error: (e && typeof e === 'object' && e.message) ? e : { message: String(e) } }; }
    function from(table) {
      var q = { sel: '*', f: [], o: null, l: null };
      var api = {
        select: function (c) { q.sel = c || '*'; return api; },
        eq: function (c, v) { q.f.push(encodeURIComponent(c) + '=eq.' + encodeURIComponent(v)); return api; },
        order: function (c, opt) { q.o = encodeURIComponent(c) + '.' + ((opt && opt.ascending === false) ? 'desc' : 'asc'); return api; },
        limit: function (n) { q.l = n; return api; },
        then: function (res, rej) { return run().then(res, rej); }
      };
      async function run() {
        try {
          var u = url + '/rest/v1/' + encodeURIComponent(table) + '?select=' + encodeURIComponent(q.sel) +
            q.f.map(function (x) { return '&' + x; }).join('') + (q.o ? '&order=' + q.o : '') + (q.l ? '&limit=' + q.l : '');
          var r = await fetch(u, { headers: H });
          var j = await r.json().catch(function () { return null; });
          return r.ok ? { data: j, error: null } : { data: null, error: j || { message: 'HTTP ' + r.status } };
        } catch (e) { return fail(e); }
      }
      return api;
    }
    async function rpc(fn, args) {
      try {
        var r = await fetch(url + '/rest/v1/rpc/' + encodeURIComponent(fn), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify(args || {}) });
        var j = await r.json().catch(function () { return null; });
        return r.ok ? { data: j, error: null } : { data: null, error: j || { message: 'HTTP ' + r.status } };
      } catch (e) { return fail(e); }
    }
    return { from: from, rpc: rpc };
  }
  var sb = makeSb(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---- Real stock status (read-only view; exact quantities are never exposed) --------------
  // The old "Reserved 9:59" timer was removed: it never blocked anything. Stock is now enforced
  // atomically on the server at the moment the order is created.
  let activeReservationExpiresAt = null;
  function noteForSize(size) { return document.querySelector('.size-cell-note[data-note-for="' + size + '"]'); }
  function clearAllSizeNotes() { document.querySelectorAll('.size-cell-note').forEach(el => { el.textContent = ''; el.classList.remove('is-shown'); }); }
  function stopReservationCountdown() {}
  async function releaseActiveReservation() {}
  let stockStatus = {};
  function applyStockToButtons() {
    document.querySelectorAll('#sizes .size-btn').forEach(btn => {
      const size = btn.dataset.size || btn.textContent.trim();
      const out = stockStatus[size] === 'sold_out';
      btn.disabled = out;
      btn.classList.toggle('is-soldout', out);
      btn.setAttribute('aria-disabled', out ? 'true' : 'false');
      if (out) btn.classList.remove('is-selected');
    });
  }
  function reserveSize(size) {
    clearAllSizeNotes();
    const note = noteForSize(size);
    if (note && stockStatus[size] === 'low') { note.textContent = 'Low stock'; note.classList.add('is-shown'); }
  }
  async function loadStock() {
    const { data, error } = await sb.from('public_stock').select('size,status');
    if (error || !Array.isArray(data)) return;
    stockStatus = {};
    data.forEach(r => { stockStatus[r.size] = r.status; });
    applyStockToButtons();
  }
  (window.requestIdleCallback||function(f){setTimeout(f,1500)})(loadStock,{timeout:4000});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStock(); });
  productCard.addEventListener('click', loadStock);

  // ---- Delivery fee per wilaya (display only; the server recomputes it) --------------------
  let shippingRates = {};
  function currentShippingFee() {
    if (!selectedWilaya) return null;
    const r = shippingRates[selectedWilaya[0]];
    if (!r) return null;
    return deliveryMethod === 'office' ? r.office : r.home;
  }
  function shipNoteEl(id, after) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = 'order-summary-ship'; after.insertAdjacentElement('afterend', el); }
    return el;
  }
  function refreshSummaryTotals() {
    const sub = cartTotalPrice();
    const fee = currentShippingFee();
    const txt = formatDZD(fee == null ? sub : sub + fee);
    summaryPrice.textContent = txt;
    summaryPrice2.textContent = txt;
    const note = fee == null ? 'Delivery fee is added once you choose your wilaya'
      : 'Includes ' + formatDZD(fee) + ' delivery (' + (deliveryMethod === 'office' ? 'to office' : 'to home') + ')';
    shipNoteEl('summaryShip', summaryPrice).textContent = note;
    shipNoteEl('summaryShip2', summaryPrice2).textContent = note;
  }
  async function loadShippingRates() {
    const { data, error } = await sb.from('shipping_rates').select('wilaya_code,home_fee,office_fee');
    if (error || !Array.isArray(data)) return;
    shippingRates = {};
    data.forEach(r => { shippingRates[r.wilaya_code] = { home: r.home_fee, office: r.office_fee }; });
    refreshSummaryTotals();
  }
  (window.requestIdleCallback||function(f){setTimeout(f,1500)})(loadShippingRates,{timeout:4000});

  // ============================================================================
  // DYNAMIC CATALOG — extra products managed from the AIRVER admin dashboard's
  // Products page. Purely additive: this only reads from Supabase and injects
  // extra `.product-card`s into the existing grid, using the exact same markup
  // as the Vertex Hoodie's card. If it fails or there are no active products,
  // the original "More styles coming soon" placeholder stays exactly as-is.
  // ============================================================================
  let catalogProducts = [];

  function formatDaysLeft(iso) {
    if (!iso) return '';
    const ms = new Date(iso) - new Date();
    if (ms <= 0) return '';
    const days = Math.ceil(ms / 86400000);
    return days <= 1 ? 'Ends today' : ('Ends in ' + days + 'd');
  }
  function productIsOnSale(p) {
    return !!p.compare_at_price && (!p.sale_ends_at || new Date(p.sale_ends_at) > new Date());
  }
  function productDiscountPct(p) {
    return p.compare_at_price > 0 ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;
  }

  function renderCatalogGrid() {
    const grid = document.querySelector('.product-grid');
    if (!grid) return;
    grid.querySelectorAll('.product-card[data-catalog-id]').forEach(el => el.remove());
    const soonCard = grid.querySelector('.product-card--soon');
    if (!catalogProducts.length) { if (soonCard) soonCard.style.display = ''; return; }
    if (soonCard) soonCard.style.display = 'none';
    catalogProducts.forEach(p => {
      const img = (p.images && p.images[0]) || '';
      const onSale = productIsOnSale(p);
      const daysLeftLabel = onSale ? formatDaysLeft(p.sale_ends_at) : '';
      const card = document.createElement('div');
      card.className = 'product-card';
      card.dataset.catalogId = p.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="product-card-media">' +
          (img ? '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '">' : '') +
          '<button type="button" class="quick-add-btn" aria-label="View product">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566z"/><path d="M8 11V6a4 4 0 0 1 8 0v5"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="product-card-info">' +
          '<h2 class="product-card-name">' + escapeHtml(p.name) + '</h2>' +
          '<p class="product-card-price">' +
            (onSale ? formatDZD(p.price) + ' <s>' + formatDZD(p.compare_at_price) + '</s>' : 'From ' + formatDZD(p.price)) +
          '</p>' +
          (onSale ? '<div class="offer-row"><span class="offer-badge">-' + productDiscountPct(p) + '%</span>' + (daysLeftLabel ? '<span class="offer-countdown">' + daysLeftLabel + '</span>' : '') + '</div>' : '') +
        '</div>' +
        '<span class="product-card-cta">View details<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
      card.addEventListener('click', () => openQuickView(p));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuickView(p); } });
      grid.appendChild(card);
    });
  }

  async function loadCatalogProducts() {
    if (!sb) return;
    try {
      const { data, error } = await sb.from('products').select('*').eq('status', 'active').order('created_at', { ascending: false });
      if (error) { console.error('Could not load catalog products:', error); return; }
      catalogProducts = data || [];
      renderCatalogGrid();
      if (window.__airverRefreshSearch) window.__airverRefreshSearch();
    } catch (err) {
      console.error('Could not load catalog products:', err);
    }
  }
  loadCatalogProducts();

  // ---- Quick View sheet: photos, price/sale badge, sizes, quantity, add to cart ----
  let quickViewProduct = null, quickViewQty = 1, quickViewSelectedSize = null;
  const quickViewSheet = document.getElementById('quickViewSheet');
  const quickViewMainImg = document.getElementById('quickViewMainImg');
  const quickViewThumbs = document.getElementById('quickViewThumbs');
  const quickViewTitleEl = document.getElementById('quickViewTitle');
  const quickViewPriceEl = document.getElementById('quickViewPrice');
  const quickViewOfferRow = document.getElementById('quickViewOfferRow');
  const quickViewDescEl = document.getElementById('quickViewDesc');
  const quickViewSizeLabel = document.getElementById('quickViewSizeLabel');
  const quickViewSizes = document.getElementById('quickViewSizes');
  const quickViewQtyValue = document.getElementById('quickViewQtyValue');

  function openQuickView(product) {
    quickViewProduct = product;
    quickViewQty = 1;
    quickViewQtyValue.textContent = '1';
    quickViewSelectedSize = null;

    quickViewTitleEl.textContent = product.name;
    const imgs = (product.images && product.images.length) ? product.images : [''];
    quickViewMainImg.src = imgs[0];
    quickViewThumbs.innerHTML = imgs.length > 1 ? imgs.map((src, i) =>
      '<button type="button" class="quickview-thumb' + (i === 0 ? ' is-selected' : '') + '" data-idx="' + i + '"><img src="' + escapeHtml(src) + '" alt=""></button>'
    ).join('') : '';

    const onSale = productIsOnSale(product);
    quickViewPriceEl.innerHTML = onSale
      ? formatDZD(product.price) + ' <s>' + formatDZD(product.compare_at_price) + '</s>'
      : formatDZD(product.price);
    if (onSale) {
      const daysLeftLabel = formatDaysLeft(product.sale_ends_at);
      quickViewOfferRow.style.display = 'flex';
      quickViewOfferRow.innerHTML = '<span class="offer-badge">-' + productDiscountPct(product) + '%</span>' + (daysLeftLabel ? '<span class="offer-countdown">' + daysLeftLabel + '</span>' : '');
    } else {
      quickViewOfferRow.style.display = 'none';
      quickViewOfferRow.innerHTML = '';
    }

    quickViewDescEl.textContent = product.description || '';

    if (product.sizes && product.sizes.length) {
      quickViewSizeLabel.style.display = '';
      quickViewSizes.innerHTML = product.sizes.map((s, i) =>
        '<button type="button" class="size-btn" data-size="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>'
      ).join('');
    } else {
      quickViewSizeLabel.style.display = 'none';
      quickViewSizes.innerHTML = '';
    }

    quickViewSheet.classList.add('is-open');
    setBodyLock(true);
  }
  function closeQuickView() {
    quickViewSheet.classList.remove('is-open');
    setBodyLock(false);
  }
  document.getElementById('quickViewCloseBtn').addEventListener('click', closeQuickView);
  document.getElementById('quickViewBackdrop').addEventListener('click', closeQuickView);

  quickViewThumbs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-idx]');
    if (!btn || !quickViewProduct) return;
    quickViewMainImg.src = quickViewProduct.images[Number(btn.dataset.idx)];
    quickViewThumbs.querySelectorAll('.quickview-thumb').forEach(t => t.classList.remove('is-selected'));
    btn.classList.add('is-selected');
  });
  quickViewSizes.addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn) return;
    quickViewSizes.querySelectorAll('.size-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    quickViewSelectedSize = btn.dataset.size;
  });
  document.getElementById('quickViewQtyMinus').addEventListener('click', () => {
    quickViewQty = Math.max(1, quickViewQty - 1);
    quickViewQtyValue.textContent = String(quickViewQty);
  });
  document.getElementById('quickViewQtyPlus').addEventListener('click', () => {
    quickViewQty = Math.min(10, quickViewQty + 1);
    quickViewQtyValue.textContent = String(quickViewQty);
  });
  document.getElementById('quickViewAddBtn').addEventListener('click', () => {
    if (!quickViewProduct) return;
    const needsSize = quickViewProduct.sizes && quickViewProduct.sizes.length > 0;
    if (needsSize && !quickViewSelectedSize) {
      quickViewSizes.classList.remove('is-invalid');
      void quickViewSizes.offsetWidth;
      quickViewSizes.classList.add('is-invalid');
      return;
    }
    addCatalogItemToCart(quickViewProduct, quickViewSelectedSize || 'One size', quickViewQty);
    flyToCart(quickViewMainImg);
  });

  // ---- Order submission, with retry + a visible failure state -----------------------------
  // Previously this call was fire-and-forget with no await: if the Supabase write failed, the
  // customer still saw "Thank you" while the order never reached the dashboard — a silent lost
  // sale. It now retries once, and if it still fails, offers a WhatsApp fallback pre-filled
  // with the order so nothing gets lost, instead of quietly pretending the order went through.
  // ---- Order submission: ONLY through the create-order Edge Function ---------------------------
  // The server recomputes every price (hoodie, online discount, catalog items, delivery fee for the
  // wilaya), checks and decrements real stock, rate-limits, verifies the captcha and generates the
  // order reference. Anything price-like we send is ignored by the server (expected_total is only a
  // safety check so a customer is never charged an amount different from the one displayed).
  const WHATSAPP_NUMBER = '213XXXXXXXXX'; // TODO: your real WhatsApp Business number (international format, digits only)
  function waFallbackLink(o) {
    if (WHATSAPP_NUMBER.indexOf('X') !== -1) return null;   // placeholder number: never offer a dead link
    const msg = 'New order (site sync failed)\n' + o.name + ' - ' + o.phone + '\n' + o.wilaya + ' - ' + o.address +
      '\n' + cartSummaryLabel() + ' - ' + o.total + ' - ' + (o.method === 'cod' ? 'Cash on Delivery' : 'Online Payment');
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);
  }
  function newUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.random() * 256; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  // Same order, pressed twice (or retried after a dropped connection) = same request id = one order.
  function requestIdFor(o) {
    const fp = JSON.stringify([o.phone, o.wilayaCode, o.deliveryRaw, o.method, cart.map(i => [i.productId || 'hoodie', i.size, i.qty])]);
    try {
      const saved = JSON.parse(sessionStorage.getItem('airverReq') || 'null');
      if (saved && saved.fp === fp && Date.now() - saved.t < 10 * 60 * 1000) return saved.id;
      const id = newUuid(); sessionStorage.setItem('airverReq', JSON.stringify({ fp: fp, id: id, t: Date.now() })); return id;
    } catch (e) { return newUuid(); }
  }
  let tsWidget = null, tsLoading = null, tsResolve = null, tsReject = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!tsLoading) tsLoading = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      el.async = true; el.onload = () => res(); el.onerror = () => { tsLoading = null; rej(new Error('captcha_load')); };
      document.head.appendChild(el);
    });
    return tsLoading;
  }
  async function getTurnstileToken() {
    await loadTurnstile();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('captcha_timeout')), 45000);
      tsResolve = t => { clearTimeout(timer); resolve(t); };
      tsReject = e => { clearTimeout(timer); reject(e); };
      if (tsWidget === null) {
        tsWidget = window.turnstile.render('#tsBox', {
          sitekey: TURNSTILE_SITE_KEY, execution: 'execute', appearance: 'interaction-only',
          callback: t => tsResolve && tsResolve(t),
          'error-callback': () => { tsReject && tsReject(new Error('captcha_error')); },
          'timeout-callback': () => { tsReject && tsReject(new Error('captcha_timeout')); }
        });
      } else { window.turnstile.reset(tsWidget); }
      window.turnstile.execute(tsWidget);
    });
  }
  function orderPayload(o, method) {
    return {
      name: o.name, phone: o.phone, second_phone: o.secondPhone || null, address: o.address, maps_url: o.mapsUrl || null,
      wilaya_code: o.wilayaCode, delivery: o.deliveryRaw, method: method,
      items: cart.map(i => ({ sku: i.productId ? String(i.productId) : 'hoodie', size: String(i.size), qty: i.qty })),
      request_id: o.requestId, expected_total: o.totalNum
    };
  }
  async function submitOrderToServer(o, method) {
    if (!cart.length) return { ok: false, code: 'EMPTY_CART' };
    const body = orderPayload(o, method);
    for (let attempt = 0; attempt < 2; attempt++) {
      try { body.turnstile_token = await getTurnstileToken(); } catch (e) { return { ok: false, code: 'CAPTCHA_FAILED' }; }
      try {
        const res = await fetch(CREATE_ORDER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return { ok: true, data: data };
        return { ok: false, code: data.error || 'SERVER_ERROR', data: data, status: res.status };   // a definitive answer: never retried
      } catch (err) {
        if (attempt === 1) return { ok: false, code: 'NETWORK' };
        await new Promise(r => setTimeout(r, 1200));   // safe: same request_id => the server never creates a 2nd order
      }
    }
    return { ok: false, code: 'NETWORK' };
  }
  const FIELD_LABELS = { name: 'name', phone: 'phone number', second_phone: 'second phone number', address: 'address', maps_url: 'Google Maps link', wilaya_code: 'wilaya', items: 'cart' };
  function orderErrorMessage(r) {
    const d = r.data || {};
    switch (r.code) {
      case 'OUT_OF_STOCK': return 'Sorry, size ' + (d.size || '') + ' has just sold out. Please choose another size.';
      case 'RATE_LIMIT': return 'Too many attempts. Please wait a little and try again.';
      case 'CAPTCHA_FAILED': case 'CAPTCHA_ERROR': return 'The security check did not complete. Please reload the page and try again.';
      case 'PRICE_CHANGED': return 'The price was just updated to ' + (d.total ? formatDZD(d.total) : 'a new amount') + '. Please reload the page and review your order.';
      case 'INVALID_FIELD': return 'Please check your ' + (FIELD_LABELS[d.field] || 'details') + ' and try again.';
      case 'PAYMENT_UNAVAILABLE': return 'Online payment is temporarily unavailable. Please choose Cash on Delivery.';
      case 'NETWORK': return 'We could not reach our server. Check your connection and try again.';
      default: return 'Something went wrong. Please try again in a moment.';
    }
  }
  const ERR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
  function showBanner(banner, text, linkHref) {
    banner.innerHTML = ERR_ICON + '<span></span>';
    const span = banner.querySelector('span');
    span.textContent = text;
    if (linkHref) {
      const a = document.createElement('a');
      a.href = linkHref; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = ' Send it to us on WhatsApp.';
      span.appendChild(a);
    }
    banner.classList.add('is-open');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function applyServerTotals(o, d) {
    o.ref = d.ref; o.totalNum = d.total; o.total = formatDZD(d.total); o.shippingFee = d.shipping_fee; o.subtotal = d.subtotal;
  }

  // ============================================================================
  // CART — persisted in localStorage. Checkout previously assumed a single
  // hardcoded item; cart lines are now keyed by size (adding the same size
  // again just increases its quantity). To avoid touching the Supabase table
  // the order dashboard already reads from, cart contents still travel through
  // the existing 'variant' text field as a summary (e.g. "Noir · M×2, L")
  // rather than adding new columns the dashboard doesn't know about.
  // ============================================================================
  let cart = [];
  let buyNowBackup = null;
  try { cart = JSON.parse(localStorage.getItem('airverCart') || '[]'); } catch (e) { cart = []; }

  const cartBadge = document.getElementById('cartBadge');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartEmptyState = document.getElementById('cartEmptyState');
  const cartSummaryEl = document.getElementById('cartSummary');
  const cartTotalPriceEl = document.getElementById('cartTotalPrice');
  const cartSheet = document.getElementById('cartSheet');

  function formatDZD(n) { return n.toLocaleString('en-US').replace(/,/g, ' ') + ' DA'; }
  // A cart line's identity: legacy Vertex Hoodie lines are keyed by size alone (unchanged
  // from before); catalog-product lines (added from the admin dashboard) are keyed by
  // productId+size, so a hoodie and a catalog item that happen to share a size letter
  // never merge into one line.
  function cartItemKey(item) { return (item.productId || 'hoodie') + '::' + item.size; }
  // Per-line unit price: the hoodie's price still depends on the chosen payment method
  // (existing behavior, unchanged); catalog products have one fixed price regardless.
  function cartItemUnitPrice(item) { return item.productId ? item.price : cartUnitPrice(); }

  function cartUnitPrice() { return selectedPaymentMethod === 'cod' ? PRICE_COD_NUM : PRICE_ONLINE_NUM; }
  function cartTotalCount() { return cart.reduce((sum, i) => sum + i.qty, 0); }
  function cartTotalPrice() { return cart.reduce((sum, i) => sum + i.qty * cartItemUnitPrice(i), 0); }
  function cartLineSummary() { return cart.map(i => (i.productId ? i.name + ' ' : '') + i.size + (i.qty > 1 ? '×' + i.qty : '')).join(', '); }
  function cartSummaryLabel() {
    if (cart.length === 0) return 'Vertex Hoodie (Noir)';
    const hasHoodie = cart.some(i => !i.productId);
    const hasOther = cart.some(i => i.productId);
    if (hasHoodie && !hasOther) return 'Vertex Hoodie (Noir) · ' + cartLineSummary();
    if (!hasHoodie && hasOther) return cartLineSummary();
    return 'Vertex Hoodie (Noir) + more · ' + cartLineSummary();
  }

  function updateCartBadge() {
    const count = cartTotalCount();
    const countText = String(count);
    const displayValue = count > 0 ? 'flex' : 'none';
    cartBadge.textContent = countText;
    cartBadge.style.display = displayValue;
    const overlayCartBadge = document.getElementById('overlayCartBadge');
    if (overlayCartBadge) {
      overlayCartBadge.textContent = countText;
      overlayCartBadge.style.display = displayValue;
    }
  }

  function renderCartItems() {
    cartItemsList.innerHTML = '';
    const hasItems = cart.length > 0;
    cartEmptyState.classList.toggle('is-shown', !hasItems);
    cartSummaryEl.classList.toggle('is-shown', hasItems);
    if (!hasItems) return;
    const heroThumb = (viewerImgs[0] && viewerImgs[0].src) || '';
    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.dataset.key = cartItemKey(item);
      const thumbSrc = item.productId ? (item.image || heroThumb) : heroThumb;
      const name = item.productId ? item.name : 'Vertex Hoodie';
      row.innerHTML =
        '<img class="cart-item-img" src="' + thumbSrc + '" alt="">' +
        '<div class="cart-item-info">' +
          '<span class="cart-item-name">' + escapeHtml(name) + '</span>' +
          '<span class="cart-item-size">Size ' + escapeHtml(item.size) + '</span>' +
          '<div class="qty-stepper">' +
            '<button type="button" class="qty-btn cart-qty-minus" aria-label="Decrease quantity">−</button>' +
            '<span class="qty-value">' + item.qty + '</span>' +
            '<button type="button" class="qty-btn cart-qty-plus" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-item-right">' +
          '<span class="cart-item-price">' + formatDZD(item.qty * cartItemUnitPrice(item)) + '</span>' +
          '<button type="button" class="cart-item-remove">Remove</button>' +
        '</div>';
      cartItemsList.appendChild(row);
    });
    cartTotalPriceEl.textContent = formatDZD(cartTotalPrice());
  }

  function saveCart() {
    localStorage.setItem('airverCart', JSON.stringify(cart));
    updateCartBadge();
    renderCartItems();
  }

  cartItemsList.addEventListener('click', (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const key = row.dataset.key;
    const item = cart.find(i => cartItemKey(i) === key);
    if (!item) return;
    if (e.target.classList.contains('cart-qty-plus')) {
      item.qty = Math.min(item.qty + 1, 10);
      saveCart();
    } else if (e.target.classList.contains('cart-qty-minus')) {
      item.qty -= 1;
      if (item.qty <= 0) cart = cart.filter(i => cartItemKey(i) !== key);
      saveCart();
    } else if (e.target.classList.contains('cart-item-remove')) {
      cart = cart.filter(i => cartItemKey(i) !== key);
      saveCart();
    }
  });

  function addToCart(size, qty) {
    const existing = cart.find(i => !i.productId && i.size === size);
    if (existing) existing.qty = Math.min(existing.qty + qty, 10);
    else cart.push({ size, qty });
    saveCart();
  }

  // Adds a product from the dynamic "More styles" catalog (admin-managed) to the cart.
  function addCatalogItemToCart(product, size, qty) {
    const existing = cart.find(i => i.productId === product.id && i.size === size);
    if (existing) { existing.qty = Math.min(existing.qty + qty, 10); saveCart(); return; }
    cart.push({
      productId: product.id,
      name: product.name,
      image: (product.images && product.images[0]) || '',
      price: product.price,
      productType: product.product_type,
      size: size,
      qty: qty
    });
    saveCart();
  }

  function openCartSheet() {
    renderCartItems();
    cartSheet.classList.add('is-open');
    setBodyLock(true);
  }
  function closeCartSheet() {
    cartSheet.classList.remove('is-open');
    setBodyLock(false);
  }
  document.getElementById('cartBtn').addEventListener('click', openCartSheet);
  document.getElementById('overlayCartBtn').addEventListener('click', openCartSheet);
  document.getElementById('closeCartBtn').addEventListener('click', closeCartSheet);
  document.getElementById('cartBackdrop').addEventListener('click', closeCartSheet);
  document.getElementById('cartCheckoutBtn').addEventListener('click', () => {
    if (cart.length === 0) return;
    closeCartSheet();
    openCheckout(true);
  });

  // ---- Fly-to-cart animation: clone the current product photo, shrink it down ----
  // to the cart icon's position, then bump the icon to confirm the add. Targets
  // whichever cart icon is actually visible right now — the main nav's on the
  // landing page, or the one in the product page's own header once that's open,
  // since the nav's icon sits behind the product page and can't be seen there.
  function activeCartBtn() {
    const overlay = document.getElementById('productOverlay');
    return (overlay && overlay.classList.contains('is-open'))
      ? document.getElementById('overlayCartBtn')
      : document.getElementById('cartBtn');
  }
  function flyToCart(sourceImgEl) {
    if (!sourceImgEl || !sourceImgEl.getBoundingClientRect) { bumpCartIcon(); return; }
    const startRect = sourceImgEl.getBoundingClientRect();
    const cartRect = activeCartBtn().getBoundingClientRect();
    if (startRect.width === 0 || cartRect.width === 0) { bumpCartIcon(); return; }

    const flyImg = document.createElement('img');
    flyImg.src = sourceImgEl.src;
    flyImg.style.cssText =
      'position:fixed; z-index:500; pointer-events:none; object-fit:cover; border-radius:14px;' +
      'top:' + startRect.top + 'px; left:' + startRect.left + 'px;' +
      'width:' + startRect.width + 'px; height:' + startRect.height + 'px;' +
      'transition: transform .7s cubic-bezier(.5,-0.1,.6,1.1), opacity .6s ease .1s;' +
      'will-change: transform, opacity;';
    document.body.appendChild(flyImg);

    // Quick pulse on the source image itself for instant tactile feedback
    const oldTransition = sourceImgEl.style.transition;
    sourceImgEl.style.transition = 'transform .25s var(--ease)';
    sourceImgEl.style.transform = 'scale(.94)';
    setTimeout(() => { sourceImgEl.style.transform = 'scale(1)'; sourceImgEl.style.transition = oldTransition; }, 220);

    requestAnimationFrame(() => {
      const dx = (cartRect.left + cartRect.width / 2) - (startRect.left + startRect.width / 2);
      const dy = (cartRect.top + cartRect.height / 2) - (startRect.top + startRect.height / 2);
      flyImg.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.05)';
      flyImg.style.opacity = '0.2';
    });
    setTimeout(() => { flyImg.remove(); bumpCartIcon(); }, 720);
  }
  function bumpCartIcon() {
    const cartBtn = activeCartBtn();
    cartBtn.classList.add('cart-bump');
    setTimeout(() => cartBtn.classList.remove('cart-bump'), 450);
  }
  let selectedPaymentMethod = 'cod';
  let deliveryMethod = 'home';
  let selectedWilaya = null;
  let order = null;
  updateCartBadge();
  renderCartItems();

  function selectPaymentOption(method) {
    selectedPaymentMethod = method;
    const priceText = formatDZD(cartTotalPrice());
    const label = cartSummaryLabel();
    sheetOptionCod.classList.toggle('is-selected', method === 'cod');
    sheetOptionOnline.classList.toggle('is-selected', method === 'online');
    if (method === 'cod') {
      summaryMethod.textContent = 'Cash on Delivery';
      detailsSubmitBtnText.textContent = 'Confirm Order';
    } else {
      summaryMethod.textContent = 'Internet Payment (Online)';
      detailsSubmitBtnText.textContent = 'Proceed to Payment';
    }
    summaryPrice.textContent = priceText;
    summaryTitle.textContent = label;
    summaryPrice2.textContent = priceText;
    summaryTitle2.textContent = label;
    refreshSummaryTotals();
  }

  const sheetOptionCod = document.getElementById('sheetOptionCod');
  const sheetOptionOnline = document.getElementById('sheetOptionOnline');
  sheetOptionCod.addEventListener('click', () => selectPaymentOption('cod'));
  sheetOptionOnline.addEventListener('click', () => selectPaymentOption('online'));

  // create-checkout was rebuilt to actually call Chargily's API (previously it
  // held the webhook's code by mistake, so online payment failed silently).
  // Online payment is back on for the Vertex Hoodie. Catalog items still go
  // through Cash on Delivery only — see the gating logic below — since
  // create-checkout only prices a single hoodie amount today.
  const ONLINE_PAYMENT_ENABLED = true;
  function updatePaymentOptionsForCart() {
    const hasCatalogItem = cart.some(i => i.productId);
    const disableOnline = !ONLINE_PAYMENT_ENABLED || hasCatalogItem;
    const noteText = !ONLINE_PAYMENT_ENABLED
      ? 'Online card payment is temporarily unavailable — please choose Cash on Delivery. We are working on it.'
      : 'Card payment is available for the Vertex Hoodie only right now — choose Cash on Delivery for the rest of your order.';
    const note = document.getElementById('onlineDisabledNoteSheet');
    note.textContent = noteText;
    note.style.display = disableOnline ? '' : 'none';
    sheetOptionOnline.classList.toggle('is-disabled', disableOnline);
    if (disableOnline && selectedPaymentMethod === 'online') selectedPaymentMethod = 'cod';
  }

  // Delivery tabs — glassy water-drop thumb, draggable by hand
  function thumbSet(method, animate) {
    deliveryThumb.style.transition = animate ? '' : 'none';
    deliveryThumb.style.left = '';
    deliveryThumb.style.transform = method === 'office' ? 'translateX(100%)' : 'translateX(0)';
  }

  function setDelivery(method) {
    deliveryMethod = method;
    if (typeof refreshSummaryTotals === 'function' && typeof selectedWilaya !== 'undefined') setTimeout(refreshSummaryTotals, 0);
    deliveryHome.classList.toggle('is-active', method === 'home');
    deliveryOffice.classList.toggle('is-active', method === 'office');
    const addressIcon = document.getElementById('addressIcon');
    if (method === 'home') {
      addressLabel.textContent = 'Home Address';
      document.getElementById('inputAddress').placeholder = 'Street, neighbourhood, municipality';
      if (addressIcon) addressIcon.innerHTML = '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>';
    } else {
      addressLabel.textContent = 'Office Name';
      document.getElementById('inputAddress').placeholder = 'Company name and full address';
      if (addressIcon) addressIcon.innerHTML = '<path d="M3 21h18"/><path d="M6 21V8a1 1 0 0 1 1-1h4V4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3h4a1 1 0 0 1 1 1v13"/><path d="M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01"/>';
    }
    thumbSet(method, true);
  }

  let deliveryDrag = null;
  function deliveryDragStart(x, pointerId) {
    const rect = deliveryTabs.getBoundingClientRect();
    deliveryDrag = {
      rect,
      startX: x,
      basePct: deliveryMethod === 'office' ? 100 : 0,
      thumbW: rect.width / 2 - 4,
      moved: false,
      lastX: x,
      lastPct: deliveryMethod === 'office' ? 100 : 0
    };
    deliveryTabs.classList.add('is-dragging');
    deliveryThumb.style.transition = 'none';
    thumbDragApply(deliveryDrag.basePct);
    if (pointerId != null) deliveryTabs.setPointerCapture(pointerId);
  }
  function thumbDragApply(pct) {
    deliveryThumb.style.left = '';
    deliveryThumb.style.transform = 'translateX(' + Math.max(0, Math.min(100, pct)) + '%)';
  }
  function deliveryDragMove(x) {
    if (!deliveryDrag) return;
    if (Math.abs(x - deliveryDrag.startX) > 6) deliveryDrag.moved = true;
    const pct = deliveryDrag.basePct + ((x - deliveryDrag.startX) / deliveryDrag.thumbW) * 100;
    const c = Math.max(0, Math.min(100, pct));
    thumbDragApply(c);
    deliveryDrag.lastPct = c;
    deliveryDrag.lastX = x;
  }
  function deliveryDragEnd() {
    if (!deliveryDrag) return;
    const rect = deliveryTabs.getBoundingClientRect();
    const wantOffice = deliveryDrag.moved
      ? deliveryDrag.lastPct >= 50
      : (deliveryDrag.lastX - rect.left) >= rect.width / 2;
    deliveryDrag = null;
    deliveryTabs.classList.remove('is-dragging');
    setDelivery(wantOffice ? 'office' : 'home');
  }

  deliveryTabs.addEventListener('pointerdown', (e) => {
    deliveryDragStart(e.clientX, e.pointerId);
  });
  deliveryTabs.addEventListener('pointermove', (e) => deliveryDragMove(e.clientX));
  deliveryTabs.addEventListener('pointerup', (e) => deliveryDragEnd());
  deliveryTabs.addEventListener('pointercancel', () => deliveryDragEnd());

  // Keyboard activation still works (pointer gestures retarget clicks to the container)
  deliveryHome.addEventListener('click', () => setDelivery('home'));
  deliveryOffice.addEventListener('click', () => setDelivery('office'));

  // Wilaya glass picker
  function renderWilayas(query) {
    const q = (query || '').trim().toLowerCase();
    const match = WILAYAS.filter(w =>
      !q ||
      String(w[0]).indexOf(q) === 0 ||
      w[1].toLowerCase().includes(q) ||
      w[2].includes((query || '').trim()) ||
      (w[2] + ' ' + w[1]).toLowerCase().includes(q)
    );
    if (!match.length) {
      wilayaList.innerHTML = '<li class="wilaya-empty">No wilaya found</li>';
      return;
    }
    // Sorted alphabetically with sticky-style letter headers — much easier to scan
    // now that the list runs to 69 wilayas instead of 58.
    const sorted = [...match].sort((a, b) => a[1].localeCompare(b[1]));
    const frag = document.createDocumentFragment();
    let lastLetter = '';
    sorted.forEach(w => {
      const letter = w[1][0].toUpperCase();
      if (letter !== lastLetter) {
        lastLetter = letter;
        const header = document.createElement('li');
        header.className = 'wilaya-letter';
        header.textContent = letter;
        frag.appendChild(header);
      }
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wilaya-item' + (selectedWilaya && selectedWilaya[0] === w[0] ? ' is-selected' : '');
      btn.innerHTML = '<span class="wilaya-number">' + String(w[0]).padStart(2, '0') + '</span><span class="wilaya-name">' + w[1] + '<small>' + w[2] + '</small></span>';
      btn.addEventListener('click', () => pickWilaya(w));
      li.appendChild(btn);
      frag.appendChild(li);
    });
    wilayaList.innerHTML = '';
    wilayaList.appendChild(frag);
  }
  function pickWilaya(w) {
    selectedWilaya = w;
    inputWilayaLabel.textContent = String(w[0]).padStart(2, '0') + ' — ' + w[1];
    inputWilayaBtn.classList.add('has-value');
    inputWilayaBtn.classList.remove('is-invalid');
    closeWilaya();
    refreshSummaryTotals();
  }
  function openWilaya() {
    wilayaSearch.value = '';
    renderWilayas('');
    wilayaModal.classList.add('is-open');
    inputWilayaBtn.classList.add('is-open');
    setTimeout(() => wilayaSearch.focus(), 120);
  }
  function closeWilaya() {
    wilayaModal.classList.remove('is-open');
    inputWilayaBtn.classList.remove('is-open');
  }
  inputWilayaBtn.addEventListener('click', openWilaya);
  wilayaClose.addEventListener('click', closeWilaya);
  wilayaBackdrop.addEventListener('click', closeWilaya);
  wilayaSearch.addEventListener('input', (e) => renderWilayas(e.target.value));

  // Body scroll lock helpers.
  // IMPORTANT: this uses position:fixed + a negative top offset, not just
  // overflow:hidden. overflow:hidden alone on a very tall <body> is not
  // reliable on real touch devices (iOS Safari in particular): the page
  // stays in normal flow, and touch-drag scrolling inside a nested
  // scrollable container (like the checkout sheet body) can stop
  // responding even though overflow-y:auto is set correctly — which is
  // exactly the "Secure Payment only shows the top part" bug, since that
  // step has the most content and is the first to make it unreachable.
  // Removing the body from flow with position:fixed avoids that failure
  // mode entirely, on every browser.
  let bodyLockScrollY = 0;
  function setBodyLock(lock) {
    if (lock) {
      bodyLockScrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = (-bodyLockScrollY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      // Explicit behavior:'instant' — the page has `scroll-behavior:smooth` globally,
      // which otherwise turns this restore into a visible animated jump (briefly shows
      // the top of the page, then glides back down) every time a sheet closes.
      window.scrollTo({ top: bodyLockScrollY, left: 0, behavior: 'instant' });
    }
  }

  // Bottom sheet open/close
  function resetCheckoutState() {
    detailsForm.reset();
    paymentForm.reset();
    setDelivery('home');
    selectedWilaya = null;
    inputWilayaLabel.textContent = 'Choose your wilaya';
    inputWilayaBtn.classList.remove('has-value', 'is-invalid');
    mapsInput.value = '';
    refreshSummaryTotals();
    copyMapsBtn.classList.remove('is-copied');
    copyMapsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    mapsToggleBtn.classList.remove('is-on');
    mapsToggleBtn.setAttribute('aria-checked', 'false');
    mapsFieldWrapper.classList.remove('is-shown');
    goToSubstepA();
  }

  // Shipping Details now runs as two short sub-steps instead of one long form —
  // 1) name & phone, 2) delivery/wilaya/address — with a small "Step 1 of 2" progress bar.
  const detailsSubstepA = document.getElementById('detailsSubstepA');
  const detailsSubstepB = document.getElementById('detailsSubstepB');
  const detailsProgressLabel = document.getElementById('detailsProgressLabel');
  const detailsProgressFill = document.getElementById('detailsProgressFill');
  function goToSubstepA() {
    detailsSubstepB.classList.remove('is-active');
    detailsSubstepA.classList.add('is-active');
    detailsProgressLabel.textContent = 'Step 1 of 2';
    detailsProgressFill.style.width = '50%';
    setCheckoutHeaderBack(goToPaymentMethodStep);
  }
  function goToSubstepB() {
    [inputName, inputPhone].forEach(el => el.classList.toggle('is-invalid', !el.checkValidity()));
    const firstInvalid = [inputName, inputPhone].find(el => !el.checkValidity());
    if (firstInvalid) {
      const isPhone = firstInvalid === inputPhone;
      orderErrorBanner.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><span>' +
        (isPhone ? 'Enter a valid Algerian phone number, e.g. 0551 23 45 67.' : 'Please fill in the highlighted field above.') +
        '</span>';
      orderErrorBanner.classList.add('is-open');
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid.focus({ preventScroll: true });
      return;
    }
    orderErrorBanner.classList.remove('is-open');
    detailsSubstepA.classList.remove('is-active');
    detailsSubstepB.classList.add('is-active');
    detailsProgressLabel.textContent = 'Step 2 of 2';
    detailsProgressFill.style.width = '100%';
    setCheckoutHeaderBack(goToSubstepA);
  }
  document.getElementById('detailsNextBtn').addEventListener('click', goToSubstepB);

  // "Your Location" is off by default — an optional toggle instead of an always-visible field.
  const mapsToggleBtn = document.getElementById('mapsToggleBtn');
  const mapsFieldWrapper = document.getElementById('mapsFieldWrapper');
  mapsToggleBtn.addEventListener('click', () => {
    const isOn = mapsToggleBtn.classList.toggle('is-on');
    mapsToggleBtn.setAttribute('aria-checked', String(isOn));
    mapsFieldWrapper.classList.toggle('is-shown', isOn);
    if (isOn) setTimeout(() => document.getElementById('inputMapsLink').focus(), 260);
  });

  const CLOSE_ICON = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
  const BACK_ICON = '<path d="M15 18l-6-6 6-6"/>';
  let checkoutHeaderBackAction = null; // null = close mode; a function = back mode
  function setCheckoutHeaderClose() {
    checkoutHeaderBackAction = null;
    closeCheckoutIcon.innerHTML = CLOSE_ICON;
    closeCheckoutBtn.setAttribute('aria-label', 'Close checkout');
  }
  function setCheckoutHeaderBack(action) {
    checkoutHeaderBackAction = action;
    closeCheckoutIcon.innerHTML = BACK_ICON;
    closeCheckoutBtn.setAttribute('aria-label', 'Back');
  }

  const stepPaymentMethod = document.getElementById('stepPaymentMethod');
  function openCheckout(startAtPaymentStep) {
    resetCheckoutState();
    updatePaymentOptionsForCart();
    selectPaymentOption(selectedPaymentMethod);
    if (startAtPaymentStep) {
      stepPaymentMethod.classList.add('is-active');
      stepDetails.classList.remove('is-active');
      checkoutSheetTitle.textContent = 'Payment Method';
      setCheckoutHeaderClose();
    } else {
      stepPaymentMethod.classList.remove('is-active');
      stepDetails.classList.add('is-active');
      checkoutSheetTitle.textContent = 'Shipping Details';
      setCheckoutHeaderBack(goToSubstepA);
    }
    stepPayment.classList.remove('is-active');
    checkoutBottomSheet.classList.add('is-open');
    setBodyLock(true);
  }

  function goToPaymentMethodStep() {
    stepDetails.classList.remove('is-active');
    stepPaymentMethod.classList.add('is-active');
    checkoutSheetTitle.textContent = 'Payment Method';
    setCheckoutHeaderClose();
  }

  document.getElementById('paymentMethodContinueBtn').addEventListener('click', () => {
    stepPaymentMethod.classList.remove('is-active');
    stepDetails.classList.add('is-active');
    checkoutSheetTitle.textContent = 'Shipping Details';
    setCheckoutHeaderBack(goToPaymentMethodStep);
  });

  function restoreBuyNow() {
    if (!buyNowBackup) return;
    cart = buyNowBackup; buyNowBackup = null;
    updateCartBadge(); renderCartItems();
  }
  // After an order goes through: a normal checkout empties the cart; a one-item "Order Now" leaves the cart as it was.
  function clearCartAfterOrder() {
    if (buyNowBackup) { cart = buyNowBackup; buyNowBackup = null; } else { cart = []; }
    saveCart();
  }
  function closeCheckout() {
    checkoutBottomSheet.classList.remove('is-open');
    setBodyLock(false);
    restoreBuyNow();
  }

  const sizesEl = document.getElementById('sizes');
  function getSelectedSize() {
    const btn = document.querySelector('#sizes .size-btn.is-selected');
    return btn ? (btn.dataset.size || btn.textContent.trim()) : null;
  }
  function promptSizeSelection() {
    sizesEl.classList.remove('is-invalid');
    void sizesEl.offsetWidth; // restart the animation if it's already mid-shake
    sizesEl.classList.add('is-invalid');
  }

  addBtn.addEventListener('click', () => {
    const size = getSelectedSize();
    if (!size) { promptSizeSelection(); return; }
    addToCart(size, currentQty);
    flyToCart(viewerImgs[currentImgIdx] || viewerImgs[0]);
    currentQty = 1;
    qtyValueEl.textContent = '1';
  });
  // "Order Now" buys this item on its own: the cart is set aside while checkout runs and put back
  // afterwards, so nothing is added to (or removed from) the customer's cart.
  document.getElementById('orderNowBtn').addEventListener('click', () => {
    const size = getSelectedSize();
    if (!size) { promptSizeSelection(); return; }
    if (!buyNowBackup) buyNowBackup = cart;
    cart = [{ size, qty: currentQty }];
    currentQty = 1;
    qtyValueEl.textContent = '1';
    openCheckout(true);
  });
  document.getElementById('cartBrowseBtn').addEventListener('click', () => {
    closeCartSheet();
    document.getElementById('cardSticky').scrollIntoView({ behavior: 'smooth' });
  });
  closeCheckoutBtn.addEventListener('click', () => {
    if (checkoutHeaderBackAction) checkoutHeaderBackAction();
    else closeCheckout();
  });
  checkoutBackdrop.addEventListener('click', closeCheckout);

  // Toggle secondary phone number
  const toggleSecondPhoneBtn = document.getElementById('toggleSecondPhoneBtn');
  const secondPhoneWrapper = document.getElementById('secondPhoneWrapper');
  toggleSecondPhoneBtn.addEventListener('click', () => {
    const isOpen = secondPhoneWrapper.classList.toggle('is-open');
    toggleSecondPhoneBtn.classList.toggle('is-active', isOpen);
  });

  [detailsForm, paymentForm].forEach(f => f.addEventListener('submit', e => e.preventDefault()));
  // Step 1: Info Form submit
  const detailsSubmitBtn = document.getElementById('detailsSubmitBtn');
  const orderErrorBanner = document.getElementById('orderErrorBanner');
  const inputName = document.getElementById('inputName');
  const inputPhone = document.getElementById('inputPhone');
  const inputAddress = document.getElementById('inputAddress');
  [inputName, inputPhone, inputAddress].forEach(el => {
    el.addEventListener('input', () => {
      if (el.checkValidity()) el.classList.remove('is-invalid');
    });
  });

  detailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    orderErrorBanner.classList.remove('is-open');

    // Custom, always-visible validation feedback — the browser's native reportValidity()
    // popup silently fails to render inside iframes/embedded previews, which made the form
    // look broken (click did nothing) when it was actually just blocking on an invalid field.
    [inputName, inputPhone, inputAddress].forEach(el => el.classList.toggle('is-invalid', !el.checkValidity()));
    const firstInvalidField = [inputName, inputPhone, inputAddress].find(el => !el.checkValidity());
    if (firstInvalidField) {
      const isPhone = firstInvalidField === inputPhone;
      orderErrorBanner.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><span>' +
        (isPhone ? 'Enter a valid Algerian phone number, e.g. 0551 23 45 67.' : 'Please fill in the highlighted field above.') +
        '</span>';
      orderErrorBanner.classList.add('is-open');
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalidField.focus({ preventScroll: true });
      return;
    }

    if (!selectedWilaya) {
      inputWilayaBtn.classList.add('is-invalid');
      orderErrorBanner.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><span>Please choose your wilaya above.</span>';
      orderErrorBanner.classList.add('is-open');
      inputWilayaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    order = {
      ref: '',   // assigned by the server
      name: document.getElementById('inputName').value.trim(),
      phone: document.getElementById('inputPhone').value.trim(),
      secondPhone: document.getElementById('inputPhone2').value.trim() || null,
      address: document.getElementById('inputAddress').value.trim(),
      mapsUrl: mapsInput.value.trim(),
      wilaya: String(selectedWilaya[0]).padStart(2, '0') + ' — ' + selectedWilaya[1],
      wilayaCode: selectedWilaya[0],
      wilayaName: selectedWilaya[1],
      delivery: deliveryMethod === 'home' ? 'To Home' : 'To Office',
      deliveryRaw: deliveryMethod,
      method: selectedPaymentMethod,
      total: formatDZD(cartTotalPrice() + (currentShippingFee() || 0)),
      totalNum: currentShippingFee() == null ? null : cartTotalPrice() + currentShippingFee(),
      size: cartLineSummary() || 'M'
    };
    order.shippingFee = currentShippingFee();
    order.requestId = requestIdFor(order);

    if (selectedPaymentMethod === 'cod') {
      detailsSubmitBtn.disabled = true;
      const oldHTML = detailsSubmitBtn.innerHTML;
      detailsSubmitBtn.innerHTML =
        '<svg class="spinner" viewBox="0 0 50 50" style="animation: rotate 2s linear infinite; width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 4; stroke-linecap: round; display:inline-block; vertical-align:middle; margin-right:7px;"><circle cx="25" cy="25" r="20" style="stroke-dasharray: 1, 150; stroke-dashoffset: 0; animation: dash 1.5s ease-in-out infinite;"></circle></svg><span style="vertical-align:middle;">Confirming…</span>';

      const result = await submitOrderToServer(order, 'cod');

      detailsSubmitBtn.disabled = false;
      detailsSubmitBtn.innerHTML = oldHTML;

      if (result.ok) {
        applyServerTotals(order, result.data);
        stepDetails.classList.remove('is-active');
        showReview();
      } else {
        showBanner(orderErrorBanner, orderErrorMessage(result), result.code === 'NETWORK' ? waFallbackLink(order) : null);
        if (result.code === 'OUT_OF_STOCK') loadStock();
      }
    } else {
      stepDetails.classList.remove('is-active');
      stepPayment.classList.add('is-active');
      checkoutSheetTitle.textContent = 'Secure Payment';
    }
  });

  // Step 2: Payment method tabs — purely informational now (which networks are accepted);
  // Chargily's own hosted page is where the customer actually enters card details.
  const tabEdahabia = document.getElementById('tabEdahabia');
  const tabCIB = document.getElementById('tabCIB');
  const orderSummarySubtitle = document.getElementById('orderSummarySubtitle');

  tabEdahabia.addEventListener('click', () => {
    tabEdahabia.classList.add('is-active');
    tabCIB.classList.remove('is-active');
    orderSummarySubtitle.textContent = 'Internet Payment — Edahabia';
  });

  tabCIB.addEventListener('click', () => {
    tabCIB.classList.add('is-active');
    tabEdahabia.classList.remove('is-active');
    orderSummarySubtitle.textContent = 'Internet Payment — CIB Card';
  });

  // Real payment: sends the order to our secure Edge Function, which creates
  // the order in Supabase (status: pending_payment) and asks Chargily for a
  // real, hosted checkout page. We then redirect the browser there.
  const EDGE_FUNCTIONS_BASE = SUPABASE_URL + '/functions/v1';
  const payBtn = document.getElementById('payBtn');
  const paymentErrorBanner = document.getElementById('paymentErrorBanner');
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    paymentErrorBanner.classList.remove('is-open');

    payBtn.disabled = true;
    const oldBtnHTML = payBtn.innerHTML;
    payBtn.innerHTML = `
      <svg class="spinner" viewBox="0 0 50 50" style="animation: rotate 2s linear infinite; width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 4; stroke-linecap: round; display: inline-block; vertical-align: middle;">
        <circle class="path" cx="25" cy="25" r="20" style="stroke-dasharray: 1, 150; stroke-dashoffset: 0; animation: dash 1.5s ease-in-out infinite;"></circle>
      </svg>
      <span style="display: inline-block; vertical-align: middle; margin-left: 8px;">Processing…</span>
    `;

    try {
      const result = await submitOrderToServer(order, 'online');
      if (!result.ok) throw result;
      applyServerTotals(order, result.data);
      // Only ever follow a link that really belongs to Chargily.
      let dest = null;
      try { const u = new URL(result.data.checkout_url); if (u.protocol === 'https:' && /(^|\.)chargily\.(dz|net)$/.test(u.hostname)) dest = u.toString(); } catch (e) {}
      if (!dest) throw { ok: false, code: 'PAYMENT_UNAVAILABLE' };
      try { localStorage.setItem('airverPendingOrder', JSON.stringify(order)); } catch (e) {}
      clearCartAfterOrder();
      window.location.href = dest;
    } catch (err) {
      payBtn.disabled = false;
      payBtn.innerHTML = oldBtnHTML;
      showBanner(paymentErrorBanner, orderErrorMessage(err && err.code ? err : { code: 'NETWORK' }), null);
    }
  });

  // If Chargily just redirected the customer back here after payment,
  // restore their order and show the confirmation / review screen.
  (function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (!paymentStatus) return;

    history.replaceState(null, '', window.location.pathname);

    if (paymentStatus === 'success') {
      const saved = localStorage.getItem('airverPendingOrder');
      if (saved) {
        let pending = null;
        try { pending = JSON.parse(saved); } catch (e) {}
        const refParam = params.get('ref');
        if (pending && pending.ref && (!refParam || refParam === pending.ref)) {
          order = pending;
          localStorage.removeItem('airverPendingOrder');
          showReview();
        }
      }
    } else if (paymentStatus === 'failed') {
      alert('Payment was not completed. Please try again.');
    }
  })();

  // Review modal: fills the customer info, build QR for online orders,
  // save-to-image and the OK action that opens the glassy thank-you page.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  // Canvas elements lose their drawn pixels with plain cloneNode() — only the
  // empty <canvas> tag gets copied, not the QR pattern painted onto it. Redraw
  // the bitmap onto a fresh canvas instead so the exported invoice keeps it.
  // Copy the store location link into the clipboard.
  function flashCopied() {
    copyMapsBtn.classList.add('is-copied');
    copyMapsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
      copyMapsBtn.classList.remove('is-copied');
      copyMapsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    }, 1500);
  }

  copyMapsBtn.addEventListener('click', () => {
    const val = mapsInput.value.trim();
    if (!val) { mapsInput.focus(); return; }
    const done = () => flashCopied();
    const fallback = () => { fallbackCopy(val); done(); };
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      let settled = false;
      const guard = setTimeout(() => { if (!settled) { settled = true; fallback(); } }, 600);
      navigator.clipboard.writeText(val).then(
        () => { if (!settled) { settled = true; clearTimeout(guard); done(); } },
        () => { if (!settled) { settled = true; clearTimeout(guard); fallback(); } }
      );
    } else {
      fallback();
    }
  });

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function showReview() {
    clearCartAfterOrder();
    reviewRef.textContent = order.ref;
    const isCod = order.method === 'cod';
    const methodBadge = '<span class="review-method ' + (isCod ? 'is-cod' : 'is-online') + '">' +
      (isCod ? 'Cash on Delivery · ' : 'Internet Payment · ') + order.delivery + '</span>';
    reviewBody.innerHTML =
      '<div class="review-row"><span class="r-label">Client</span><span class="r-value">' + escapeHtml(order.name) + '</span></div>' +
      '<div class="review-row"><span class="r-label">Phone</span><span class="r-value">' + escapeHtml(order.phone) + '</span></div>' +
      (order.secondPhone ? '<div class="review-row"><span class="r-label">Second Phone</span><span class="r-value">' + escapeHtml(order.secondPhone) + '</span></div>' : '') +
      '<div class="review-row"><span class="r-label">Delivery</span><span class="r-value">' + escapeHtml(order.delivery) + '</span></div>' +
      '<div class="review-row"><span class="r-label">Address</span><span class="r-value">' + escapeHtml(order.address) + '</span></div>' +
      '<div class="review-row"><span class="r-label">Wilaya</span><span class="r-value">' + escapeHtml(order.wilaya) + '</span></div>' +
      '<div class="review-row"><span class="r-label">Size</span><span class="r-value">' + escapeHtml(order.size) + '</span></div>' +
      '<div class="review-row"><span class="r-label">Payment</span><span class="r-value">' + methodBadge + '</span></div>' +
      (order.shippingFee != null ? '<div class="review-row"><span class="r-label">Delivery fee</span><span class="r-value">' + escapeHtml(formatDZD(order.shippingFee)) + '</span></div>' : '') +
      '<div class="review-row"><span class="r-label">Total</span><span class="r-value is-total">' + escapeHtml(order.total) + '</span></div>';

    closeCheckout();
    setBodyLock(true);
    reviewModal.classList.add('is-open');
  }

  reviewOkBtn.addEventListener('click', () => {
    reviewModal.classList.remove('is-open');
    thanksModal.classList.add('is-open');
  });

  thanksDoneBtn.addEventListener('click', () => {
    thanksModal.classList.remove('is-open');
    setBodyLock(false);
    // Scroll back down to the product grid — the product overlay is still open
    // underneath the review/thanks modals at this point, so close it first.
    closeOverlay();
    window.scrollTo({ top: heroHeight, behavior: 'smooth' });
  });

  saveImageBtn.addEventListener('click', async () => {
    if (typeof html2canvas === 'undefined') {
      try {
        await new Promise((res, rej) => {
          const el = document.createElement('script');
          el.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          el.onload = res; el.onerror = rej; document.head.appendChild(el);
        });
      } catch (e) { alert('Image export is unavailable offline.'); return; }
    }
    saveImageBtn.disabled = true;
    saveImageBtn.textContent = 'Generating…';
    const invoice = document.getElementById('invoiceSheet');
    const invoiceRef = document.getElementById('invoiceRef');
    const invoiceDate = document.getElementById('invoiceDate');
    const invoiceClient = document.getElementById('invoiceClient');
    const invoicePhone = document.getElementById('invoicePhone');
    const invoiceSecondRow = document.getElementById('invoiceSecondRow');
    const invoiceSecond = document.getElementById('invoiceSecond');
    const invoiceDelivery = document.getElementById('invoiceDelivery');
    const invoiceAddress = document.getElementById('invoiceAddress');
    const invoiceWilaya = document.getElementById('invoiceWilaya');
    const invoiceSize = document.getElementById('invoiceSize');
    const invoiceMethod = document.getElementById('invoiceMethod');
    const invoiceTotal = document.getElementById('invoiceTotal');
    try {
      invoiceRef.textContent = order.ref;
      invoiceDate.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      invoiceClient.textContent = order.name;
      invoicePhone.textContent = order.phone;
      if (order.secondPhone) {
        invoiceSecondRow.style.display = '';
        invoiceSecond.textContent = order.secondPhone;
      } else {
        invoiceSecondRow.style.display = 'none';
        invoiceSecond.textContent = '';
      }
      invoiceDelivery.textContent = order.delivery;
      invoiceAddress.textContent = order.address || '—';
      invoiceWilaya.textContent = order.wilaya;
      invoiceSize.textContent = order.size;
      invoiceMethod.textContent = (order.method === 'cod' ? 'Cash on Delivery' : 'Internet Payment') + ' · ' + order.delivery;
      invoiceTotal.textContent = order.total;

      invoice.style.display = 'block';
      const canvas = await html2canvas(invoice, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      });
      const a = document.createElement('a');
      a.download = 'AIRVER-' + order.ref.replace('#', '') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (err) {
      alert('Could not export the image.');
    } finally {
      invoice.style.display = 'none';
      saveImageBtn.disabled = false;
      saveImageBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Save as Image</span>';
    }
  });


  // ---- Swipe-to-dismiss: drag the sheet down from its handle to close it, like a native ----
  // bottom sheet. Works with touch and mouse/pointer alike.
  function makeSheetDraggable(contentEl, handleEl, closeFn) {
    let dragging = false;
    let startY = 0;
    let currentY = 0;
    let startTime = 0;

    function start(y) {
      dragging = true;
      startY = y;
      currentY = 0;
      startTime = Date.now();
      contentEl.style.transition = 'none';
    }
    function move(y) {
      if (!dragging) return;
      currentY = Math.max(0, y - startY);
      contentEl.style.transform = 'translateY(' + currentY + 'px)';
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      contentEl.style.transition = '';
      contentEl.style.transform = '';
      const elapsed = Math.max(Date.now() - startTime, 1);
      const velocity = currentY / elapsed; // px per ms — a fast flick closes even if short
      const threshold = contentEl.offsetHeight * 0.26;
      if (currentY > threshold || velocity > 0.55) closeFn();
    }

    handleEl.addEventListener('touchstart', (e) => start(e.touches[0].clientY), { passive: true });
    handleEl.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
    handleEl.addEventListener('touchend', end);
    handleEl.addEventListener('touchcancel', end);

    handleEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // touch already handled above
      handleEl.setPointerCapture(e.pointerId);
      start(e.clientY);
    });
    handleEl.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') move(e.clientY); });
    handleEl.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') end(); });
    handleEl.addEventListener('pointercancel', end);
  }
  makeSheetDraggable(
    document.querySelector('#checkoutBottomSheet .bottom-sheet-content'),
    document.querySelector('#checkoutBottomSheet .bottom-sheet-drag-handle'),
    closeCheckout
  );
  makeSheetDraggable(
    document.querySelector('#cartSheet .bottom-sheet-content'),
    document.querySelector('#cartSheet .bottom-sheet-drag-handle'),
    closeCartSheet
  );

  // Basic image protection (matches previous AIRVER site conventions)
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());
  });

  // ---- Hamburger / mobile menu (nav-links had no fallback under 720px until now) ----
  const navHamburger = document.getElementById('navHamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuBackdrop = document.getElementById('mobileMenuBackdrop');
  function closeMobileMenu() {
    mobileMenu.classList.remove('is-open');
    mobileMenuBackdrop.classList.remove('is-open');
    navHamburger.classList.remove('is-open');
    navHamburger.setAttribute('aria-expanded', 'false');
  }
  navHamburger.addEventListener('click', () => {
    const willOpen = !mobileMenu.classList.contains('is-open');
    mobileMenu.classList.toggle('is-open', willOpen);
    mobileMenuBackdrop.classList.toggle('is-open', willOpen);
    navHamburger.classList.toggle('is-open', willOpen);
    navHamburger.setAttribute('aria-expanded', String(willOpen));
  });
  mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
  document.getElementById('mobileMenuClose').addEventListener('click', closeMobileMenu);
  mobileMenu.querySelectorAll('.mobile-menu-main a').forEach(a => {
    a.addEventListener('click', closeMobileMenu);
  });
  document.getElementById('mobileSizeGuideBtn').addEventListener('click', () => {
    closeMobileMenu();
    document.getElementById('sizeGuideModal').classList.add('is-open');
  });

  // (cartBtn's click handler now lives with the rest of the cart system, opening the cart
  // sheet — a leftover handler here used to also open the product overlay on every click,
  // which is why clicking the cart icon looked like it "jumped straight to the product page".)

  // ---- Search: full-screen page. Finds products (the hoodie + catalog products) and opens ----
  // the chosen product's page directly. Help pages (size guide, shipping...) show as chips
  // only when the query matches them.
  const searchModal = document.getElementById('searchModal');
  const searchInput = document.getElementById('searchInput');
  const searchField = document.getElementById('searchField');
  const searchResultsEl = document.getElementById('searchResults');
  const SEARCH_INFO = [
    { title: 'Size guide', kw: 'size guide measurements fit chest length sleeve xl large small', run: () => document.getElementById('sizeGuideModal').classList.add('is-open') },
    { title: 'Shipping', kw: 'shipping delivery wilaya time cost', run: () => openPolicies('shipping') },
    { title: 'Returns & exchanges', kw: 'return exchange refund wrong size', run: () => openPolicies('returns') },
    { title: 'Privacy policy', kw: 'privacy data personal information', run: () => openPolicies('privacy') },
    { title: 'Terms', kw: 'terms conditions legal', run: () => openPolicies('terms') },
    { title: 'Contact us', kw: 'contact whatsapp help support message', run: () => window.open('https://wa.me/' + WHATSAPP_NUMBER, '_blank') }
  ];
  const SEARCH_CHEVRON = '<svg class="search-card-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

  function searchNorm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '');
  }
  // bolds the part of a product name that matches what was typed
  function searchHighlight(text, q) {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return escapeHtml(text);
    const low = String(text).toLowerCase();
    const mark = new Array(text.length).fill(false);
    tokens.forEach(t => { let i = low.indexOf(t); while (i !== -1) { for (let k = i; k < i + t.length; k++) mark[k] = true; i = low.indexOf(t, i + t.length); } });
    let out = '', open = false;
    for (let k = 0; k < text.length; k++) {
      if (mark[k] && !open) { out += '<b>'; open = true; }
      if (!mark[k] && open) { out += '</b>'; open = false; }
      out += escapeHtml(text[k]);
    }
    return out + (open ? '</b>' : '');
  }
  function searchAllProducts() {
    const hoodieImgEl = document.querySelector('#productCard .product-card-media img');
    const hoodiePriceEl = document.querySelector('#productCard .product-card-price');
    const list = [{
      name: 'Vertex Hoodie', sub: 'Outerwear — Noir',
      price: hoodiePriceEl ? hoodiePriceEl.textContent.trim() : PRICE_COD, old: '', badge: '',
      img: hoodieImgEl ? hoodieImgEl.src : '',
      kw: 'vertex hoodie noir outerwear jacket sweatshirt black airver هودي',
      open: () => openOverlay()
    }];
    (typeof catalogProducts !== 'undefined' ? catalogProducts : []).forEach(p => {
      const onSale = productIsOnSale(p);
      list.push({
        name: p.name,
        sub: p.category || p.subtitle || 'AIRVER',
        price: formatDZD(p.price),
        old: onSale ? formatDZD(p.compare_at_price) : '',
        badge: onSale ? '-' + productDiscountPct(p) + '%' : '',
        img: (p.images && p.images[0]) || '',
        kw: [p.name, p.category, p.description].filter(Boolean).join(' '),
        open: () => openQuickView(p)
      });
    });
    return list;
  }
  function searchMatches(q, hay) {
    const tokens = searchNorm(q).split(/\s+/).filter(Boolean);
    const h = searchNorm(hay);
    return tokens.every(t => h.includes(t));
  }
  function searchCardHtml(p, idx, q) {
    return '<button type="button" class="search-card" style="--i:' + idx + '" data-idx="' + idx + '">' +
      '<span class="search-card-media">' + (p.img ? '<img src="' + p.img + '" alt="" loading="lazy">' : '') + '</span>' +
      '<span class="search-card-text">' +
        '<span class="search-card-name">' + searchHighlight(p.name, q || '') + '</span>' +
        '<span class="search-card-sub">' + escapeHtml(p.sub) + '</span>' +
      '</span>' +
      '<span class="search-card-end">' +
        '<span class="search-card-price">' + escapeHtml(p.price) + '</span>' +
        (p.old ? '<span class="search-card-old">' + escapeHtml(p.old) + '</span>' : '') +
        (p.badge ? '<span class="search-card-badge">' + escapeHtml(p.badge) + '</span>' : '') +
      '</span>' + SEARCH_CHEVRON + '</button>';
  }
  let searchShown = [];   // products on screen, in order (results first, then suggestions)
  let searchActive = -1;  // keyboard-highlighted card
  function setSearchActive(i) {
    const cards = searchResultsEl.querySelectorAll('.search-card');
    searchActive = cards.length ? (i + cards.length) % cards.length : -1;
    cards.forEach((c, n) => c.classList.toggle('is-active', n === searchActive));
    if (searchActive > -1) cards[searchActive].scrollIntoView({ block: 'nearest' });
  }
  function renderSearch(query) {
    const q = query.trim();
    const all = searchAllProducts();
    const results = q ? all.filter(p => searchMatches(q, p.name + ' ' + p.kw)) : [];
    const suggested = all.filter(p => results.indexOf(p) === -1);
    searchShown = results.concat(suggested);
    searchActive = -1;
    let html = '';
    if (!q) {
      const terms = ['Hoodie', 'Noir', 'Outerwear'];
      all.slice(1).forEach(p => { [p.name, p.sub].forEach(t => { if (t && t !== 'AIRVER' && terms.indexOf(t) === -1) terms.push(t); }); });
      html += '<section class="search-section"><div class="search-section-title">Popular searches</div><div class="search-chips">' +
        terms.slice(0, 8).map(t => '<button type="button" class="search-chip" data-term="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>').join('') + '</div></section>';
    } else if (results.length) {
      html += '<section class="search-section"><div class="search-section-title">Results<em>' + results.length + (results.length === 1 ? ' product' : ' products') + '</em></div><div class="search-cards">' +
        results.map((p, i) => searchCardHtml(p, i, q)).join('') + '</div></section>';
    } else {
      html += '<div class="search-empty"><div class="search-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div><strong>No results for “' + escapeHtml(q) + '”</strong><span>Check the spelling or try a different word.</span></div>';
    }
    if (q) {
      const info = SEARCH_INFO.filter(i => searchMatches(q, i.title + ' ' + i.kw));
      if (info.length) {
        html += '<section class="search-section"><div class="search-section-title">Help</div><div class="search-chips">' +
          info.map(i => '<button type="button" class="search-chip" data-info="' + SEARCH_INFO.indexOf(i) + '">' + escapeHtml(i.title) + '</button>').join('') + '</div></section>';
      }
    }
    if (suggested.length) {
      html += '<section class="search-section search-section--suggested"><div class="search-section-title">Suggested products</div><div class="search-cards">' +
        suggested.map((p, i) => searchCardHtml(p, results.length + i, '')).join('') + '</div></section>';
    }
    searchResultsEl.innerHTML = html;
    searchResultsEl.scrollTop = 0;
    searchField.classList.toggle('has-value', !!searchInput.value);
  }
  function openSearchPage() {
    searchInput.value = '';
    renderSearch('');
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    searchModal.classList.add('is-open');
    searchModal.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
    setTimeout(() => searchInput.focus(), 150);
  }
  function closeSearchPage() {
    if (!searchModal.classList.contains('is-open')) return;
    searchModal.classList.remove('is-open');
    searchModal.setAttribute('aria-hidden', 'true');
    searchInput.blur();
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
  document.getElementById('searchBtn').addEventListener('click', openSearchPage);
  searchInput.addEventListener('input', () => renderSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchActive(searchActive + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchActive(searchActive - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = searchActive > -1 ? searchActive : (searchInput.value.trim() ? 0 : -1);
      if (idx > -1 && searchShown[idx]) { const p = searchShown[idx]; closeSearchPage(); p.open(); }
      else searchInput.blur();
    }
  });
  document.getElementById('searchClearBtn').addEventListener('click', () => {
    searchInput.value = ''; renderSearch(''); searchInput.focus();
  });
  document.getElementById('searchCloseBtn').addEventListener('click', closeSearchPage);
  searchResultsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.search-card');
    if (card) { const p = searchShown[+card.dataset.idx]; closeSearchPage(); if (p) p.open(); return; }
    const chip = e.target.closest('.search-chip');
    if (!chip) return;
    if (chip.dataset.term) { searchInput.value = chip.dataset.term; renderSearch(searchInput.value); searchInput.focus(); return; }
    const it = SEARCH_INFO[+chip.dataset.info]; closeSearchPage(); if (it) it.run();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchModal.classList.contains('is-open')) closeSearchPage();
  });
  // catalog products load a moment after the page does — refresh the list if search is open
  window.__airverRefreshSearch = () => { if (searchModal.classList.contains('is-open')) renderSearch(searchInput.value); };

  // ---- Customer reviews -----------------------------------------------------------------
  // Everyone can read. To write, the customer enters their order number + phone; the
  // database (functions in airver-reviews-setup.sql) checks the pair matches a real order
  // AND that it has shipped — the browser never reads the orders table, and the same check
  // runs again when the review is saved, so it cannot be skipped.
  const REVIEW_PRODUCT = 'Vertex Hoodie';
  const RV_STAR = '<svg viewBox="0 0 24 24"><path d="M12 17.75l-6.16 3.24 1.18-6.88L2 9.24l6.92-1L12 2l3.08 6.24 6.92 1-5.02 4.87 1.18 6.88z"/></svg>';
  const RV_CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
  const RV_INFO = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r=".6" fill="currentColor"/></svg>';
  const RV_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const reviewsLayout = document.getElementById('reviewsLayout');
  const reviewsMini = document.getElementById('reviewsMini');
  let reviewsList = [];
  let reviewsState = 'loading';   // loading | ready | error
  let reviewsVisible = 4;

  function rvStars(value) {
    const row = RV_STAR.repeat(5);
    const pct = Math.max(0, Math.min(100, value / 5 * 100));
    return '<span class="rv-stars" role="img" aria-label="' + value.toFixed(1) + ' out of 5"><span class="rv-stars-row">' + row + '</span><span class="rv-stars-top" style="width:' + pct + '%"><span class="rv-stars-row">' + row + '</span></span></span>';
  }
  function rvDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function rvStateBox(icon, title, text, withBtn) {
    return '<div class="rv-state"><div class="rv-state-icon">' + icon + '</div><strong>' + title + '</strong><p>' + text + '</p>' +
      (withBtn ? '<button type="button" class="rv-write-btn" data-rv-write>Write a review</button>' : '') + '</div>';
  }
  function renderReviews() {
    const starIcon = '<svg viewBox="0 0 24 24"><path d="M12 17.75l-6.16 3.24 1.18-6.88L2 9.24l6.92-1L12 2l3.08 6.24 6.92 1-5.02 4.87 1.18 6.88z"/></svg>';
    if (reviewsState === 'loading') {
      reviewsLayout.innerHTML = '<div class="rv-summary"><div class="rv-skel" style="width:60%;height:34px;margin-bottom:18px"></div><div class="rv-skel" style="width:90%;margin-bottom:10px"></div><div class="rv-skel" style="width:80%"></div></div>' +
        '<div class="rv-panel"><div class="rv-item"><div class="rv-skel" style="width:30%;margin-bottom:14px"></div><div class="rv-skel" style="width:95%;margin-bottom:8px"></div><div class="rv-skel" style="width:70%"></div></div></div>';
      reviewsMini.innerHTML = '';
      reviewsMini.style.display = 'none';
      return;
    }
    reviewsMini.style.display = '';
    if (reviewsState === 'error') {
      reviewsLayout.innerHTML = rvStateBox(starIcon, 'Reviews are unavailable right now', 'Please try again in a moment.', false);
      reviewsMini.style.display = 'none';
      return;
    }
    if (!reviewsList.length) {
      reviewsLayout.innerHTML = rvStateBox(starIcon, 'No reviews yet', 'Reviews come from customers whose order has shipped. Bought the Vertex Hoodie? Be the first to share how it fits.', true);
      reviewsMini.innerHTML = '<span class="rv-mini-sub">No reviews yet</span><span>Write the first</span>';
      return;
    }
    const n = reviewsList.length;
    const avg = reviewsList.reduce((a, r) => a + r.rating, 0) / n;
    const counts = [5, 4, 3, 2, 1].map(k => reviewsList.filter(r => r.rating === k).length);
    const bars = [5, 4, 3, 2, 1].map((k, i) =>
      '<div class="rv-bar-row"><span>' + k + '</span><div class="rv-bar"><i style="width:' + Math.round(counts[i] / n * 100) + '%"></i></div><span>' + counts[i] + '</span></div>').join('');
    const summary = '<aside class="rv-summary"><div class="rv-avg-row"><div class="rv-avg">' + avg.toFixed(1) + '</div><div class="rv-avg-meta">' + rvStars(avg) +
      '<span class="rv-avg-count">' + n + (n === 1 ? ' review' : ' reviews') + '</span></div></div><div class="rv-bars">' + bars + '</div>' +
      '<div class="rv-verified-note">' + RV_CHECK + '<span>Every review comes from a customer whose order has shipped.</span></div></aside>';
    const shown = reviewsList.slice(0, reviewsVisible);
    const items = shown.map((r, i) =>
      '<article class="rv-item" style="--i:' + Math.min(i, 6) + '"><div class="rv-item-top">' + rvStars(r.rating) + '<span class="rv-date">' + rvDate(r.created_at) + '</span></div>' +
      '<p class="rv-body">' + escapeHtml(r.body) + '</p>' +
      '<div class="rv-item-foot"><span class="rv-name">' + escapeHtml(r.display_name) + '</span><span class="rv-verified">' + RV_CHECK + 'Verified purchase</span></div></article>').join('');
    const more = reviewsList.length > reviewsVisible ? '<button type="button" class="rv-more" id="rvMoreBtn">Show more reviews</button>' : '';
    reviewsLayout.innerHTML = summary + '<div class="rv-panel">' + items + more + '</div>';
    reviewsMini.innerHTML = rvStars(avg) + '<span>' + avg.toFixed(1) + '</span><span class="rv-mini-sub">· ' + n + (n === 1 ? ' review' : ' reviews') + '</span>';
  }
  async function loadReviews() {
    if (!sb) { reviewsState = 'error'; renderReviews(); return; }
    try {
      const { data, error } = await sb.from('public_reviews').select('id,product,rating,body,display_name,created_at')
        .eq('product', REVIEW_PRODUCT).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      reviewsList = data || [];
      reviewsState = 'ready';
    } catch (err) {
      console.error('Reviews could not be loaded:', err);
      reviewsState = 'error';
    }
    renderReviews();
  }
  reviewsLayout.addEventListener('click', (e) => {
    if (e.target.closest('[data-rv-write]')) { openReviewModal(); return; }
    if (e.target.closest('#rvMoreBtn')) { reviewsVisible += 6; renderReviews(); }
  });
  document.getElementById('reviewsWriteBtn').addEventListener('click', () => openReviewModal());
  reviewsMini.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('reviewsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- write-a-review modal ----
  const rwModal = document.getElementById('reviewWriteModal');
  const rwRef = document.getElementById('rwRef');
  const rwPhone = document.getElementById('rwPhone');
  const rwBody = document.getElementById('rwBody');
  const rwStarsEl = document.getElementById('rwStars');
  let rwCtx = null;      // { ref, phone, name } once the order is verified
  let rwRating = 0;

  rwStarsEl.innerHTML = [1, 2, 3, 4, 5].map(k =>
    '<button type="button" class="rw-star" role="radio" aria-checked="false" aria-label="' + k + ' star' + (k > 1 ? 's' : '') + '" data-k="' + k + '">' + RV_STAR + '</button>').join('');
  function rwPaintStars(val) {
    rwStarsEl.querySelectorAll('.rw-star').forEach(b => b.classList.toggle('is-on', +b.dataset.k <= val));
    document.getElementById('rwRateLabel').textContent = val ? RV_LABELS[val - 1] : 'Tap to rate';
  }
  function rwSetRating(val) {
    rwRating = val;
    rwStarsEl.querySelectorAll('.rw-star').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.k === val)));
    rwPaintStars(val);
  }
  rwStarsEl.addEventListener('click', (e) => { const b = e.target.closest('.rw-star'); if (b) { rwSetRating(+b.dataset.k); rwMsg('rwWriteMsg'); } });
  rwStarsEl.addEventListener('mouseover', (e) => { const b = e.target.closest('.rw-star'); if (b) rwPaintStars(+b.dataset.k); });
  rwStarsEl.addEventListener('mouseleave', () => rwPaintStars(rwRating));
  rwStarsEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); rwSetRating(Math.min(5, (rwRating || 0) + 1)); rwStarsEl.querySelector('[data-k="' + rwRating + '"]').focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); rwSetRating(Math.max(1, (rwRating || 2) - 1)); rwStarsEl.querySelector('[data-k="' + rwRating + '"]').focus(); }
  });

  function rwMsg(id, kind, text) {
    const el = document.getElementById(id);
    if (!kind) { el.className = 'rw-msg'; el.innerHTML = ''; return; }
    el.className = 'rw-msg is-shown is-' + kind;
    el.innerHTML = RV_INFO + '<div>' + escapeHtml(text) + '</div>';
  }
  const RW_TITLES = { verify: ['Write a review', 'Verified customers only'], write: ['Your review', 'Vertex Hoodie'], done: ['Review posted', ''] };
  function rwShow(step) {
    rwModal.querySelectorAll('.rw-step').forEach(x => x.classList.toggle('is-active', x.dataset.step === step));
    document.getElementById('rwTitle').textContent = RW_TITLES[step][0];
    document.getElementById('rwSubtitle').textContent = RW_TITLES[step][1];
  }
  function openReviewModal() {
    rwCtx = null; rwSetRating(0);
    rwRef.value = ''; rwPhone.value = ''; rwBody.textContent = '';
    document.getElementById('rwCount').textContent = '0 / 600';
    rwMsg('rwVerifyMsg'); rwMsg('rwWriteMsg');
    rwShow('verify');
    rwModal.classList.add('is-open');
    setTimeout(() => rwRef.focus(), 300);
  }
  function closeReviewModal() { rwModal.classList.remove('is-open'); }
  function rwLoading(btn, on, label) {
    btn.classList.toggle('is-loading', on);
    btn.querySelector('span').textContent = on ? label : btn.dataset.label;
  }
  const rwVerifyBtn = document.getElementById('rwVerifyBtn');
  const rwSubmitBtn = document.getElementById('rwSubmitBtn');
  rwVerifyBtn.dataset.label = 'Verify order';
  rwSubmitBtn.dataset.label = 'Submit review';

  document.getElementById('rwVerifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    rwMsg('rwVerifyMsg');
    const refNorm = rwRef.value.trim().toUpperCase().replace(/^#/, '');
    const phoneDigits = rwPhone.value.replace(/\D/g, '');
    if (!/^AV-[A-Z0-9]{6,10}$/.test(refNorm) && !/^\d{6}$/.test(refNorm.replace(/\D/g, ''))) { rwMsg('rwVerifyMsg', 'error', 'Enter the order number from your confirmation, for example AV-K7M2QX9P.'); rwRef.focus(); return; }
    if (phoneDigits.length < 9) { rwMsg('rwVerifyMsg', 'error', 'Enter the phone number you used when ordering.'); rwPhone.focus(); return; }
    if (!sb) { rwMsg('rwVerifyMsg', 'error', 'We can’t reach our server right now. Please try again in a moment.'); return; }
    rwLoading(rwVerifyBtn, true, 'Checking your order…');
    try {
      const { data, error } = await sb.rpc('review_check_order', { p_ref: rwRef.value.trim().toUpperCase(), p_phone: rwPhone.value.trim() });
      if (error) throw error;
      const st = data && data.status;
      if (st === 'not_found') {
        rwMsg('rwVerifyMsg', 'error', 'We couldn’t find an order with these details. Check the order number and the phone number you gave when ordering.');
      } else if (st === 'not_shipped') {
        rwMsg('rwVerifyMsg', 'info', 'Your order hasn’t shipped yet. You’ll be able to review it once it’s on its way.');
      } else if (st === 'ok') {
        if ((data.products || []).indexOf(REVIEW_PRODUCT) === -1) {
          rwMsg('rwVerifyMsg', 'info', 'This order doesn’t include the ' + REVIEW_PRODUCT + '.');
        } else if ((data.reviewed || []).indexOf(REVIEW_PRODUCT) !== -1) {
          rwMsg('rwVerifyMsg', 'info', 'You’ve already reviewed this order. Thank you!');
        } else {
          rwCtx = { ref: rwRef.value.trim().toUpperCase(), phone: rwPhone.value.trim(), name: data.name || 'Verified customer' };
          document.getElementById('rwChipText').innerHTML = 'Order ' + escapeHtml(data.ref || '') + ' verified<br><span>Posting as ' + escapeHtml(rwCtx.name) + '</span>';
          rwMsg('rwWriteMsg');
          rwShow('write');
          setTimeout(() => rwStarsEl.querySelector('.rw-star').focus(), 250);
        }
      } else {
        rwMsg('rwVerifyMsg', 'error', 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Order check failed:', err);
      rwMsg('rwVerifyMsg', 'error', 'We couldn’t check your order right now. Please try again in a moment.');
    }
    rwLoading(rwVerifyBtn, false);
  });

  rwBody.addEventListener('input', () => {
    rwMsg('rwWriteMsg');
    if (rwBody.textContent.length > 600) { rwBody.textContent = rwBody.textContent.slice(0, 600); }
    document.getElementById('rwCount').textContent = rwBody.textContent.length + ' / 600';
  });
  [rwRef, rwPhone].forEach(i => i.addEventListener('input', () => rwMsg('rwVerifyMsg')));
  rwBody.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, t);
  });
  document.getElementById('rwBackBtn').addEventListener('click', () => { rwCtx = null; rwMsg('rwVerifyMsg'); rwShow('verify'); });

  document.getElementById('rwWriteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    rwMsg('rwWriteMsg');
    const text = rwBody.textContent.trim();
    if (!rwCtx) { rwShow('verify'); return; }
    if (!rwRating) { rwMsg('rwWriteMsg', 'error', 'Please choose a star rating.'); return; }
    if (text.length < 10) { rwMsg('rwWriteMsg', 'error', 'Please write at least 10 characters.'); rwBody.focus(); return; }
    rwLoading(rwSubmitBtn, true, 'Posting…');
    try {
      const { data, error } = await sb.rpc('submit_review', { p_ref: rwCtx.ref, p_phone: rwCtx.phone, p_product: REVIEW_PRODUCT, p_rating: rwRating, p_body: text });
      if (error) throw error;
      const st = data && data.status;
      if (st === 'ok') {
        document.getElementById('rwDoneTitle').textContent = 'Thank you, ' + rwCtx.name.split(' ')[0];
        rwShow('done');
        reviewsVisible = Math.max(reviewsVisible, 4);
        loadReviews();
      } else if (st === 'already_reviewed') {
        rwMsg('rwWriteMsg', 'info', 'You’ve already reviewed this order. Thank you!');
      } else if (st === 'not_shipped') {
        rwMsg('rwWriteMsg', 'info', 'Your order hasn’t shipped yet. You’ll be able to review it once it’s on its way.');
      } else {
        rwMsg('rwWriteMsg', 'error', 'We couldn’t post your review. Please check it and try again.');
      }
    } catch (err) {
      console.error('Review could not be saved:', err);
      rwMsg('rwWriteMsg', 'error', 'We couldn’t post your review right now. Please try again in a moment.');
    }
    rwLoading(rwSubmitBtn, false);
  });
  document.getElementById('rwDoneBtn').addEventListener('click', closeReviewModal);
  document.getElementById('rwClose').addEventListener('click', closeReviewModal);
  document.getElementById('rwBackdrop').addEventListener('click', closeReviewModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rwModal.classList.contains('is-open')) closeReviewModal(); });
  renderReviews();
  loadReviews();

  // ---- Keep the WhatsApp button off the footer: once the footer scrolls into view the button
  // rides up with its top edge, so it never covers the footer links. ----
  (function () {
    const wa = document.querySelector('.whatsapp-float');
    const footer = document.getElementById('siteFooter');
    if (!wa || !footer) return;
    let queued = false;
    function place() {
      queued = false;
      const overlap = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top);
      wa.style.setProperty('--wa-lift', overlap + 'px');
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(place); } }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    place();
  })();

  // ---- Product row: only "overflowing" (left-aligned, swipeable) when the cards really don't fit ----
  (function () {
    const grid = document.querySelector('.product-grid');
    if (!grid) return;
    function check() {
      grid.classList.remove('is-overflowing');
      if (grid.scrollWidth > grid.clientWidth + 2) grid.classList.add('is-overflowing');
    }
    window.addEventListener('resize', check);
    window.addEventListener('load', check);
    new MutationObserver(check).observe(grid, { childList: true });
    check();
  })();

  // ---- "Home" links (desktop nav, mobile menu, breadcrumb): close the overlay if open, scroll up ----
  function goHome(e) {
    e.preventDefault();
    if (overlay.classList.contains('is-open')) closeOverlay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.getElementById('navHome').addEventListener('click', goHome);
  document.getElementById('mobileNavHome').addEventListener('click', goHome);
  document.getElementById('breadcrumbHome').addEventListener('click', goHome);

  // ---- Cookie notice ----
  const cookieBanner = document.getElementById('cookieBanner');
  if (!localStorage.getItem('airverCookieAck')) {
    setTimeout(() => cookieBanner.classList.add('is-open'), 900);
  }
  document.getElementById('cookieAcceptBtn').addEventListener('click', () => {
    localStorage.setItem('airverCookieAck', '1');
    cookieBanner.classList.remove('is-open');
  });

  // ---- Size guide modal ----
  const sizeGuideModal = document.getElementById('sizeGuideModal');
  document.getElementById('sizeGuideBtn').addEventListener('click', (e) => {
    e.preventDefault();
    sizeGuideModal.classList.add('is-open');
  });
  document.getElementById('sizeGuideClose').addEventListener('click', () => sizeGuideModal.classList.remove('is-open'));
  document.getElementById('sizeGuideBackdrop').addEventListener('click', () => sizeGuideModal.classList.remove('is-open'));

  // ---- Policies page (Shipping / Returns / Privacy / Terms) ------------------------------------
  // One full page with a glass top bar. Opened from the footer, the buy panel links, the cookie
  // banner and search. The browser's own Back (phone swipe / hardware button) closes it, and
  // /#policies-returns style links open it directly.
  const policiesPage = document.getElementById('policiesPage');
  const ppTabsEl = document.getElementById('ppTabs');
  const ppTabs = Array.from(ppTabsEl.querySelectorAll('[role="tab"]'));
  const ppPanels = Array.from(policiesPage.querySelectorAll('.pp-panel'));
  const ppThumb = ppTabsEl.querySelector('.pp-thumb');
  const ppPrev = document.getElementById('ppPrev'), ppNext = document.getElementById('ppNext');
  const PP_ORDER = ppTabs.map(t => t.dataset.tab);
  const PP_TITLES = { shipping: 'Shipping', returns: 'Returns', privacy: 'Privacy', terms: 'Terms' };
  const ppReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let ppCurrent = PP_ORDER[0], ppPushed = false, ppSaved = null, ppReturnFocus = null, ppStretchT = 0, ppDrag = null, ppSuppress = false;
  const ppIsOpen = () => policiesPage.classList.contains('is-open');
  function ppMeasure() { return ppTabs.map(b => ({ l: b.offsetLeft, w: b.offsetWidth, c: b.offsetLeft + b.offsetWidth / 2 })); }
  function ppPut(x, w) { ppThumb.style.setProperty('--x', x + 'px'); ppThumb.style.setProperty('--w', w + 'px'); }
  function ppPlace(i, instant) {
    const m = ppMeasure()[i]; if (!m) return;
    if (instant) ppThumb.classList.add('nt');
    ppPut(m.l, m.w);
    ppThumb.classList.add('vis');
    if (instant) { void ppThumb.offsetWidth; ppThumb.classList.remove('nt'); }
  }
  function ppStretch() {
    if (ppReduce.matches) return;
    ppThumb.style.setProperty('--sx', '1.1'); ppThumb.style.setProperty('--sy', '.92');
    clearTimeout(ppStretchT); ppStretchT = setTimeout(() => { ppThumb.style.removeProperty('--sx'); ppThumb.style.removeProperty('--sy'); }, 170);
  }
  function ppSelect(tab, opts) {
    opts = opts || {};
    if (PP_ORDER.indexOf(tab) < 0) tab = PP_ORDER[0];
    const changed = tab !== ppCurrent;
    ppCurrent = tab;
    const idx = PP_ORDER.indexOf(tab);
    ppTabs.forEach(t => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
    ppPanels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === tab));
    ppPlace(idx, !!opts.instant);
    if (changed && !opts.instant) ppStretch();
    const prev = PP_ORDER[idx - 1], next = PP_ORDER[idx + 1];
    ppPrev.hidden = !prev; ppNext.hidden = !next;
    if (prev) { ppPrev.dataset.tab = prev; ppPrev.querySelector('b').textContent = '\u2190 ' + PP_TITLES[prev]; }
    if (next) { ppNext.dataset.tab = next; ppNext.querySelector('b').textContent = PP_TITLES[next] + ' \u2192'; }
    if (changed || opts.top) policiesPage.scrollTop = 0;
    if (ppIsOpen()) { try { history.replaceState(history.state, '', '#policies-' + tab); } catch (e) {} }
  }
  function openPolicies(tab) {
    tab = PP_ORDER.indexOf(tab) < 0 ? PP_ORDER[0] : tab;
    if (ppIsOpen()) { ppSelect(tab); return; }
    ppReturnFocus = document.activeElement;
    ppSaved = { html: document.documentElement.style.overflow, body: document.body.style.overflow, pad: document.body.style.paddingRight };
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
    policiesPage.inert = false;
    policiesPage.setAttribute('aria-hidden', 'false');
    policiesPage.classList.add('is-open');
    ppSelect(tab, { instant: true, top: true });
    try { history.pushState({ airverPolicies: true }, '', '#policies-' + tab); ppPushed = true; } catch (e) { ppPushed = false; }
    setTimeout(() => { try { policiesPage.focus({ preventScroll: true }); } catch (e) {} ppPlace(PP_ORDER.indexOf(ppCurrent), true); }, 60);
  }
  function ppFinishClose() {
    if (!ppIsOpen()) return;
    policiesPage.classList.remove('is-open');
    policiesPage.setAttribute('aria-hidden', 'true');
    policiesPage.inert = true;
    if (ppSaved) {
      document.documentElement.style.overflow = ppSaved.html; document.body.style.overflow = ppSaved.body; document.body.style.paddingRight = ppSaved.pad; ppSaved = null;
    }
    ppPushed = false;
    if (/^#policies-/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    if (ppReturnFocus && ppReturnFocus.focus) { try { ppReturnFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function closePolicies() {
    if (!ppIsOpen()) return;
    if (ppPushed && history.state && history.state.airverPolicies) { history.back(); return; }   // popstate finishes the job
    ppFinishClose();
  }
  window.addEventListener('popstate', () => {
    if (ppIsOpen()) { ppFinishClose(); return; }
    const m = location.hash.match(/^#policies-(shipping|returns|privacy|terms)$/);
    if (m) openPolicies(m[1]);
  });
  document.querySelectorAll('.policy-open-link').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); openPolicies(el.dataset.policyTab || 'shipping'); });
  });
  document.getElementById('policiesBack').addEventListener('click', closePolicies);
  // capture phase on window: Escape closes ONLY this page, not the product page that may be open underneath
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ppIsOpen()) { e.preventDefault(); e.stopPropagation(); closePolicies(); } }, true);
  ppTabs.forEach((b, i) => {
    b.addEventListener('click', () => { if (!ppSuppress) ppSelect(b.dataset.tab); });
    b.addEventListener('keydown', (e) => {
      let to = -1;
      if (e.key === 'ArrowRight') to = Math.min(PP_ORDER.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = PP_ORDER.length - 1;
      if (to < 0) return;
      e.preventDefault(); ppSelect(PP_ORDER[to]); ppTabs[to].focus();
    });
  });
  [ppPrev, ppNext].forEach(b => b.addEventListener('click', () => ppSelect(b.dataset.tab)));
  // drag the glass droplet between tabs
  function ppOnThumb(x) { const r = ppThumb.getBoundingClientRect(); return x >= r.left - 2 && x <= r.right + 2; }
  ppTabsEl.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    ppDrag = { id: e.pointerId, x: e.clientX, go: false, hl: -1 };
    if (ppOnThumb(e.clientX)) ppTabsEl.classList.add('pr');
  });
  ppTabsEl.addEventListener('pointermove', (e) => {
    if (!ppDrag || e.pointerId !== ppDrag.id) return;
    if (!ppDrag.go) {
      if (Math.abs(e.clientX - ppDrag.x) < 5) return;
      ppDrag.go = true; try { ppTabsEl.setPointerCapture(e.pointerId); } catch (_) {}
      ppThumb.style.removeProperty('--sx'); ppThumb.style.removeProperty('--sy'); clearTimeout(ppStretchT);
      ppTabsEl.classList.add('drag', 'pr');
    }
    const m = ppMeasure(), px = e.clientX - ppTabsEl.getBoundingClientRect().left;
    const c = Math.max(m[0].c, Math.min(m[m.length - 1].c, px));
    let i = 0; while (i < m.length - 2 && c > m[i + 1].c) i++;
    const a = m[i], b = m[i + 1], t = Math.max(0, Math.min(1, (c - a.c) / (b.c - a.c))), w = a.w + (b.w - a.w) * t;
    ppPut(c - w / 2, w);
    let n = 0, best = 1e9; m.forEach((q, k) => { const d = Math.abs(q.c - px); if (d < best) { best = d; n = k; } });
    if (n !== ppDrag.hl) { ppDrag.hl = n; ppTabs.forEach((t2, k) => t2.classList.toggle('hl', k === n)); }
  });
  function ppDragEnd(e, cancel) {
    if (!ppDrag || e.pointerId !== ppDrag.id) return;
    const d = ppDrag; ppDrag = null; ppTabsEl.classList.remove('pr');
    if (!d.go) return;
    try { ppTabsEl.releasePointerCapture(e.pointerId); } catch (_) {}
    ppSuppress = true; setTimeout(() => { ppSuppress = false; }, 0);
    ppTabsEl.classList.remove('drag'); ppTabs.forEach(t => t.classList.remove('hl'));
    void ppThumb.offsetWidth;
    const target = cancel || d.hl < 0 ? PP_ORDER.indexOf(ppCurrent) : d.hl;
    const same = PP_ORDER[target] === ppCurrent;
    ppSelect(PP_ORDER[target]);
    if (same) ppPlace(target, false);
  }
  ppTabsEl.addEventListener('pointerup', (e) => ppDragEnd(e, false));
  ppTabsEl.addEventListener('pointercancel', (e) => ppDragEnd(e, true));
  window.addEventListener('resize', () => ppPlace(PP_ORDER.indexOf(ppCurrent), true));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ppPlace(PP_ORDER.indexOf(ppCurrent), true));
  { const m = location.hash.match(/^#policies-(shipping|returns|privacy|terms)$/); if (m) openPolicies(m[1]); }

  // ---- Online-payment offer countdown ----
  // Set a real end date below to show a live countdown. Left null, the badge stays as static
  // "Limited offer" text instead of faking urgency against a deadline that doesn't exist.
  const OFFER_END = null; // TODO(Raouf): e.g. new Date('2026-09-01T23:59:59+01:00')
  const offerCountdownEl = document.querySelector('.offer-countdown');
  if (OFFER_END && offerCountdownEl) {
    (function tickCountdown() {
      const diff = OFFER_END - new Date();
      if (diff <= 0) { offerCountdownEl.textContent = 'Limited offer'; return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      offerCountdownEl.textContent = 'Ends in ' + h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
      setTimeout(tickCountdown, 1000);
    })();
  }
