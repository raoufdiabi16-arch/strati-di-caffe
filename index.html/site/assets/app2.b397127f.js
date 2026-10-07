/* ===== ENTRY GATE OBJECTS: a flat-lay behind the question, each piece fully draggable ===== */
(function(){
  'use strict';
  var gate = document.getElementById('entryGate');
  if (!gate) return;
  var stage = gate.querySelector('.entry-objects');
  if (!stage) return;
  var resetBtn = stage.querySelector('.eo-reset');
  var cardEl = gate.querySelector('.entry-gate-inner');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var LAND = { w: 1536, h: 1024 };
  var PORT = { w: 390, h: 700 };

  var items = Array.prototype.map.call(stage.querySelectorAll('.eo-item'), function(el, i){
    var d = el.dataset;
    return {
      el: el, img: el.querySelector('img'), id: d.id,
      nw: +d.w, nh: +d.h,
      L: { ax: d.lax, ay: d.lay, ox: +d.lox, oy: +d.loy },
      P: { ax: d.pax, ay: d.pay, ox: +d.pox, oy: +d.poy, k: +d.pk || 0.5 },
      z0: i + 1, z: i + 1,
      x: 0, y: 0, hx: 0, hy: 0, cw: 1, ch: 1, du: 0, dv: 0, mask: null
    };
  });
  var zTop = items.length + 1;
  var mode = '', unit = 1, W = 0, H = 0;

  function clamp(v, a, b){ return Math.min(Math.max(v, a), Math.max(a, b)); }

  function place(it){
    it.x = clamp(it.hx + it.du * unit, 0, W - it.cw);
    it.y = clamp(it.hy + it.dv * unit, 0, H - it.ch);
    it.el.style.transform = 'translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,0)';
  }

  function layout(){
    W = gate.clientWidth; H = gate.clientHeight;
    if (!W || !H) return;
    var next = (W / H < 0.9) ? 'P' : 'L';
    if (next !== mode){ items.forEach(function(it){ it.du = 0; it.dv = 0; }); mode = next; }
    unit = mode === 'L' ? Math.min(W / LAND.w, H / LAND.h) : Math.min(W / PORT.w, H / PORT.h);
    var sizeScale = mode === 'L' ? 0.72 : 0.62;
    var card = cardEl ? cardEl.getBoundingClientRect() : null;
    var gateBox = gate.getBoundingClientRect();
    items.forEach(function(it){
      var c = it[mode], s = unit * sizeScale * (mode === 'L' ? 1 : c.k);
      it.cw = it.nw * s; it.ch = it.nh * s;
      it.el.style.width = it.cw.toFixed(2) + 'px';
      it.el.style.height = it.ch.toFixed(2) + 'px';
      it.hx = c.ax === 'l' ? c.ox * unit : W - c.ox * unit - it.cw;
      it.hy = c.ay === 't' ? c.oy * unit : H - c.oy * unit - it.ch;
      place(it);
      /* on a short or narrow screen the question card can cover an item's whole home spot -
         rather than leave something invisible and undraggable sitting there, hide that one
         item entirely until there is room for it again. Landscape has always had a few items
         whose rectangular bounding box grazes the card while their actual diagonal/rotated
         pixels clear it, so this guard only runs in portrait, where the card can swallow an
         item completely. */
      var blocked = false;
      if (card && mode === 'P'){
        var ix0 = gateBox.left + it.x, iy0 = gateBox.top + it.y;
        blocked = !(ix0 + it.cw < card.left || ix0 > card.right || iy0 + it.ch < card.top || iy0 > card.bottom);
      }
      it.el.classList.toggle('is-blocked', blocked);
    });
  }

  /* ---- alpha masks, so only an object's visible pixels can be grabbed ---- */
  function buildMask(it){
    var ready = it.img.decode ? it.img.decode().catch(function(){}) : Promise.resolve();
    return ready.then(function(){
      try {
        var c = document.createElement('canvas'); c.width = it.nw; c.height = it.nh;
        var g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(it.img, 0, 0, it.nw, it.nh);
        var d = g.getImageData(0, 0, it.nw, it.nh).data;
        var m = new Uint8Array(it.nw * it.nh);
        for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
        it.mask = m;
      } catch (e) { it.mask = null; }
    });
  }
  function opaqueAt(it, lx, ly){
    var u = Math.round(lx * it.nw / it.cw), v = Math.round(ly * it.nh / it.ch);
    if (u < 0 || v < 0 || u >= it.nw || v >= it.nh) return false;
    return it.mask[v * it.nw + u] > 28;
  }
  function hitItem(it, px, py, r){
    if (it.el.classList.contains('is-blocked')) return false;
    var lx = px - it.x, ly = py - it.y;
    if (lx < -r || ly < -r || lx > it.cw + r || ly > it.ch + r) return false;
    if (!it.mask) return lx >= 0 && ly >= 0 && lx <= it.cw && ly <= it.ch;
    if (opaqueAt(it, lx, ly)) return true;
    if (r > 0) for (var a = 0; a < 8; a++){
      var t = a * Math.PI / 4;
      if (opaqueAt(it, lx + Math.cos(t) * r, ly + Math.sin(t) * r)) return true;
    }
    return false;
  }
  function pick(px, py, r){
    var order = items.slice().sort(function(a, b){ return b.z - a.z; });
    var i;
    for (i = 0; i < order.length; i++) if (hitItem(order[i], px, py, 0)) return order[i];
    if (r > 0) for (i = 0; i < order.length; i++) if (hitItem(order[i], px, py, r)) return order[i];
    return null;
  }
  function local(e){ var b = stage.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }

  function bringToFront(it){ it.z = ++zTop; it.el.style.zIndex = it.z; }
  function commit(it){
    it.du = (it.x - it.hx) / unit; it.dv = (it.y - it.hy) / unit;
    stage.classList.add('is-touched');
  }

  var drag = null, hover = null;
  function setHover(it){
    if (hover === it) return;
    if (hover) hover.el.classList.remove('is-hover');
    hover = it;
    if (hover) hover.el.classList.add('is-hover');
    stage.style.cursor = hover ? 'grab' : '';
  }

  stage.addEventListener('pointerdown', function(e){
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var p = local(e);
    var it = pick(p.x, p.y, e.pointerType === 'mouse' ? 3 : 12);
    if (!it) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    setHover(null);
    bringToFront(it);
    drag = { it: it, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y };
    it.el.classList.add('is-lifted');
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', function(e){
    if (drag && e.pointerId === drag.id){
      var it = drag.it;
      it.x = clamp(drag.ox + e.clientX - drag.sx, 0, W - it.cw);
      it.y = clamp(drag.oy + e.clientY - drag.sy, 0, H - it.ch);
      it.el.style.transform = 'translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,0)';
      return;
    }
    if (e.pointerType !== 'mouse') return;
    var p = local(e); setHover(pick(p.x, p.y, 3));
  });
  function endDrag(e){
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var it = drag.it; drag = null;
    it.el.classList.remove('is-lifted');
    stage.classList.remove('is-dragging');
    commit(it);
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('lostpointercapture', endDrag);
  stage.addEventListener('pointerleave', function(e){ if (e.pointerType === 'mouse' && !drag) setHover(null); });

  /* a finger landing on an object drags it instead of doing anything else; everywhere else on
     the gate (the paper, the card) behaves exactly as before */
  stage.addEventListener('touchstart', function(e){
    var t = e.touches[0], b = stage.getBoundingClientRect();
    if (e.touches.length === 1 && pick(t.clientX - b.left, t.clientY - b.top, 12) && e.cancelable) e.preventDefault();
  }, { passive: false });
  stage.addEventListener('touchmove', function(e){ if (drag && e.cancelable) e.preventDefault(); }, { passive: false });

  items.forEach(function(it){
    it.el.setAttribute('role', 'button');
    it.el.setAttribute('tabindex', '0');
    it.el.setAttribute('aria-roledescription', 'draggable object');
    it.el.addEventListener('keydown', function(e){
      var s = e.shiftKey ? 48 : 12, dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -s; else if (e.key === 'ArrowRight') dx = s;
      else if (e.key === 'ArrowUp') dy = -s; else if (e.key === 'ArrowDown') dy = s; else return;
      e.preventDefault();
      bringToFront(it);
      it.x = clamp(it.x + dx, 0, W - it.cw); it.y = clamp(it.y + dy, 0, H - it.ch);
      it.el.style.transform = 'translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,0)';
      commit(it);
    });
  });

  if (resetBtn) resetBtn.addEventListener('click', function(){
    items.forEach(function(it){ it.du = 0; it.dv = 0; it.z = it.z0; it.el.style.zIndex = it.z0; });
    zTop = items.length + 1;
    if (!reduceMotion) items.forEach(function(it){ it.el.classList.add('is-returning'); });
    layout();
    setTimeout(function(){ items.forEach(function(it){ it.el.classList.remove('is-returning'); }); }, 850);
    stage.classList.remove('is-touched');
  });

  items.forEach(function(it){ it.el.style.zIndex = it.z; });
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(gate);
  else window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  window.__eo_debug = { items: items, pick: pick };
  Promise.all(items.map(buildMask)).then(function(){
    if (reduceMotion){ stage.classList.add('is-in'); return; }
    setTimeout(function(){ stage.classList.add('is-in'); }, 120);
  });
})();
