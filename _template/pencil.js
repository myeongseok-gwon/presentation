/* =====================================================================
   pencil.js — global Apple Pencil annotation layer for every deck.
   ---------------------------------------------------------------------
   initPencil(deck) is called by the build's reveal init AFTER the deck is
   ready. It adds ONE fixed, viewport-sized canvas over the whole deck plus a
   small top-left toolbar. Interaction model (the whole point):

     • Apple Pencil  -> draws anywhere on the current slide
     • Finger        -> passes straight through: swipe to navigate, tap widgets
     • Mouse         -> left untouched, so desktop clicking/widgets still work

   How pen-only capture works without blocking finger/mouse: the canvas is
   ALWAYS pointer-events:none (never blocks anything). Input is read by
   capture-phase listeners on `window`; only `pointerType==='pen'` events are
   consumed (drawn + stopPropagation so reveal/widgets ignore them). Finger and
   mouse events are left to propagate normally. A matching capture-phase guard
   on touch events stops reveal's swipe-nav for the *stylus* only, so the pencil
   never flips slides while you draw — a finger still does.

   Strokes are stored per slide in the deck's own 1920x1080 coordinate space and
   re-projected on every redraw, so annotations stick to the slide through
   reveal's responsive rescale and iPad rotation. Per-slide Undo / Clear.

   The toolbar (.pencil-ui) and this canvas (.pencil-overlay) are hidden by
   export.mjs so neither appears in the exported PDF / contact sheet.
   ===================================================================== */

export function initPencil(deck) {
  const W = 1920, H = 1080, DPR_MAX = 3;
  const COLORS = ['#c0392b', '#111111', '#3E7CB1', '#2e7d32']; // red default, ink, blue, green

  let penMode = true;            // pencil draws when true (toggle in the toolbar)
  let color = COLORS[0];
  let drawing = null;            // the in-progress stroke
  let dpr = 1, vw = 0, vh = 0;

  const store = new Map();       // slideKey -> [ { color, pts:[{x,y,w}] } ]  (slide coords)
  const slideKey = () => { const i = deck.getIndices(); return i.h + '.' + (i.v || 0); };
  const strokesNow = () => {
    const k = slideKey(); let s = store.get(k);
    if (!s) { s = []; store.set(k, s); } return s;
  };

  /* ---------- overlay canvas (never intercepts pointers) ---------- */
  const cv = document.createElement('canvas');
  cv.className = 'pencil-overlay';
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0',
    width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9998' });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  /* on-screen rectangle of the active slide (already includes reveal's scale
     + letterbox offset), so we can map between viewport and slide coords. */
  function slideRect() {
    const el = deck.getCurrentSlide && deck.getCurrentSlide();
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2) return r; }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  const toSlide = (cx, cy) => { const r = slideRect();
    return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H }; };
  const project = (p, r) => ({ x: r.left + p.x / W * r.width, y: r.top + p.y / H * r.height });

  const BASE = 2.5, RANGE = 14;                       // stroke width (slide px): min .. +pressure
  const widthOf = (pr) => BASE + RANGE * Math.max(0, Math.min(1, pr || 0));

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    redraw();
  }

  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const r = slideRect(), sc = r.width / W;
    for (const st of strokesNow()) {
      const p = st.pts; ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
      if (p.length === 1) { const a = project(p[0], r);
        ctx.beginPath(); ctx.arc(a.x, a.y, (p[0].w * sc) / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      for (let i = 1; i < p.length; i++) { const a = project(p[i - 1], r), b = project(p[i], r);
        ctx.lineWidth = ((p[i - 1].w + p[i].w) / 2) * sc;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
  }

  // draw only the newest segment of the in-progress stroke (cheap live feedback)
  function strokeLast() {
    const p = drawing.pts, r = slideRect(), sc = r.width / W;
    ctx.strokeStyle = drawing.color; ctx.fillStyle = drawing.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.length === 1) { const a = project(p[0], r);
      ctx.beginPath(); ctx.arc(a.x, a.y, (p[0].w * sc) / 2, 0, Math.PI * 2); ctx.fill(); return; }
    const a = project(p[p.length - 2], r), b = project(p[p.length - 1], r);
    ctx.lineWidth = ((p[p.length - 2].w + p[p.length - 1].w) / 2) * sc;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  /* ---------- toolbar ---------- */
  if (!document.getElementById('pencil-ui-style')) {
    const st = document.createElement('style');
    st.id = 'pencil-ui-style';
    st.textContent = `
      .pencil-ui{position:fixed;left:18px;top:14px;z-index:9999;display:flex;align-items:center;
        gap:10px;padding:8px 12px;border:2px solid #d8d8d8;border-radius:14px;
        background:rgba(255,255,255,.88);font-family:inherit;opacity:.82;transition:opacity .2s;}
      .pencil-ui:hover{opacity:1;}
      .pencil-ui button{font-family:inherit;cursor:pointer;}
      .pencil-ui .pu-btn{font-size:20px;line-height:1;padding:6px 13px;border:2px solid #3E7CB1;
        border-radius:10px;background:#fff;color:#3E7CB1;}
      .pencil-ui .pu-btn:hover{background:#3E7CB1;color:#fff;}
      .pencil-ui .pu-btn.on{background:#2e7d32;border-color:#2e7d32;color:#fff;}
      .pencil-ui .pu-btn.clear{border-color:#c0392b;color:#c0392b;}
      .pencil-ui .pu-btn.clear:hover{background:#c0392b;color:#fff;}
      .pencil-ui .pu-dot{width:26px;height:26px;border-radius:50%;border:2px solid #fff;
        box-shadow:0 0 0 2px #d8d8d8;padding:0;}
      .pencil-ui .pu-dot.sel{box-shadow:0 0 0 3px #111;}
      .pencil-ui .pu-sep{width:1px;height:26px;background:#e2e2e2;}`;
    document.head.appendChild(st);
  }

  const ui = document.createElement('div');
  ui.className = 'pencil-ui';

  const penBtn = document.createElement('button');
  penBtn.className = 'pu-btn on'; penBtn.type = 'button'; penBtn.textContent = 'Pen on';
  penBtn.title = 'Toggle Apple Pencil drawing';
  penBtn.addEventListener('click', () => {
    penMode = !penMode;
    penBtn.classList.toggle('on', penMode);
    penBtn.textContent = penMode ? 'Pen on' : 'Pen off';
  });
  ui.appendChild(penBtn);

  const sep1 = document.createElement('span'); sep1.className = 'pu-sep'; ui.appendChild(sep1);

  COLORS.forEach((c, i) => {
    const d = document.createElement('button');
    d.className = 'pu-dot' + (i === 0 ? ' sel' : '');
    d.type = 'button'; d.style.background = c; d.title = 'Ink color';
    d.addEventListener('click', () => {
      color = c;
      ui.querySelectorAll('.pu-dot').forEach((x) => x.classList.remove('sel'));
      d.classList.add('sel');
      if (!penMode) { penMode = true; penBtn.classList.add('on'); penBtn.textContent = 'Pen on'; }
    });
    ui.appendChild(d);
  });

  const sep2 = document.createElement('span'); sep2.className = 'pu-sep'; ui.appendChild(sep2);

  const undoBtn = document.createElement('button');
  undoBtn.className = 'pu-btn'; undoBtn.type = 'button'; undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => { strokesNow().pop(); redraw(); });
  ui.appendChild(undoBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'pu-btn clear'; clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
  clearBtn.title = 'Clear this slide';
  clearBtn.addEventListener('click', () => { store.set(slideKey(), []); redraw(); });
  ui.appendChild(clearBtn);

  document.body.appendChild(ui);

  /* ---------- pen input (capture phase, pen only) ---------- */
  function onDown(e) {
    if (ui.contains(e.target)) return;                 // tapping the toolbar must click, not draw
    if (!penMode || e.pointerType !== 'pen') return;   // only the pencil draws
    e.preventDefault(); e.stopPropagation();
    drawing = { color, pts: [] };
    strokesNow().push(drawing);
    const s = toSlide(e.clientX, e.clientY); s.w = widthOf(e.pressure);
    drawing.pts.push(s); strokeLast();
  }
  function onMove(e) {
    if (!drawing || e.pointerType !== 'pen') return;
    e.preventDefault(); e.stopPropagation();
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const s = toSlide(ev.clientX, ev.clientY); s.w = widthOf(ev.pressure);
      drawing.pts.push(s); strokeLast();
    }
  }
  function onUp(e) {
    if (!drawing) return;
    if (e.pointerType === 'pen') { e.preventDefault(); e.stopPropagation(); }
    drawing = null;
  }
  window.addEventListener('pointerdown', onDown, { capture: true });
  window.addEventListener('pointermove', onMove, { capture: true });
  window.addEventListener('pointerup', onUp, { capture: true });
  window.addEventListener('pointercancel', onUp, { capture: true });

  // Stop reveal's swipe navigation for the STYLUS only; finger swipes still navigate.
  function onTouch(e) {
    if (!penMode) return;
    const t = e.touches[0] || e.changedTouches[0];
    if (t && t.touchType === 'stylus') e.stopPropagation();
  }
  window.addEventListener('touchstart', onTouch, { capture: true });
  window.addEventListener('touchmove', onTouch, { capture: true });
  window.addEventListener('touchend', onTouch, { capture: true });

  /* ---------- keep canvas sized + redraw on slide / resize / rotate ---------- */
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  deck.on('slidechanged', redraw);
  deck.on('resize', fit);
  deck.on('ready', fit);
  fit();
}
