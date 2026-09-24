// Mapa de conexiones ("segundo cerebro"): se arma solo con hábitos, metas, tareas y diario.
// Simulación de fuerzas propia sobre <canvas> (sin librerías, funciona sin internet).
import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, addDays, fromKey, MONTHS } from '../util.js';
import { streakOf, isDoneValue } from '../habits.js';
import { currentOf } from '../goals.js';
import { pageHead, emptyState } from '../ui.js';

const KINDS = [
  ['habit', 'Hábitos'],
  ['goal', 'Metas'],
  ['task', 'Tareas'],
  ['journal', 'Diario'],
];

const hidden = new Set();
export const toggleKind = (k) => (hidden.has(k) ? hidden.delete(k) : hidden.add(k));

const positions = new Map(); // conserva el acomodo entre renders
let running = null;

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const wikiLinks = (text) => [...(text || '').matchAll(/\[\[([^\]]{1,60})\]\]/g)].map((m) => m[1].trim());

function buildGraph() {
  const nodes = new Map();
  const edges = [];
  const add = (id, kind, label, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label, ...extra }); return nodes.get(id); };
  const link = (a, b, len) => { if (nodes.has(a) && nodes.has(b) && a !== b) edges.push({ a, b, len }); };
  const byName = new Map();

  const t = today();
  const since = keyOf(addDays(t, -45));

  if (!hidden.has('habit') && state.habits.length) {
    add('hub:habit', 'hub', 'Hábitos');
    for (const h of state.habits) {
      const n = streakOf(h);
      add(`h:${h.id}`, 'habit', `${h.emoji} ${h.name}`, { weight: n, ref: h.id });
      link('hub:habit', `h:${h.id}`, 70);
      byName.set(norm(h.name), `h:${h.id}`);
    }
  }
  if (!hidden.has('goal') && state.goals.length) {
    add('hub:goal', 'hub', 'Metas');
    for (const g of state.goals) {
      add(`g:${g.id}`, 'goal', `${g.emoji} ${g.title}`, { done: currentOf(g) >= g.target, ref: g.id });
      link('hub:goal', `g:${g.id}`, 80);
      if (g.habitId) link(`g:${g.id}`, `h:${g.habitId}`, 60);
      byName.set(norm(g.title), `g:${g.id}`);
    }
  }
  if (!hidden.has('task')) {
    const tasks = state.tasks.filter((x) => x.status !== 'done' || (x.doneAt && x.doneAt >= since)).slice(-120);
    if (tasks.length) add('hub:task', 'hub', 'Tareas');
    for (const x of tasks) {
      const cat = x.category || 'Sin categoría';
      add(`c:${cat}`, 'category', cat, { ref: cat });
      link('hub:task', `c:${cat}`, 80);
      byName.set(norm(cat), `c:${cat}`);
      add(`t:${x.id}`, 'task', x.title, { done: x.status === 'done', ref: x.id });
      link(`c:${cat}`, `t:${x.id}`, 36);
      byName.set(norm(x.title), `t:${x.id}`);
    }
  }
  if (!hidden.has('journal')) {
    const days = Object.entries(state.journal).filter(([k, e]) => k >= since && ((e.text && e.text.trim()) || e.mood)).sort();
    if (days.length) add('hub:journal', 'hub', 'Diario');
    for (const [k, e] of days) {
      const d = fromKey(k);
      add(`j:${k}`, 'journal', `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`, { ref: k });
      link('hub:journal', `j:${k}`, 60);
      // Lo que hiciste ese día queda conectado a tu nota.
      const day = state.log[k] || {};
      for (const [hid, s] of Object.entries(day)) { const hb = state.habits.find((x) => x.id === hid); if (hb && isDoneValue(hb, s)) link(`j:${k}`, `h:${hid}`, 90); }
      for (const x of state.tasks) if (x.doneAt === k) link(`j:${k}`, `t:${x.id}`, 70);
      // Enlaces manuales [[...]]
      for (const name of wikiLinks(e.text)) {
        const target = byName.get(norm(name)) || add(`n:${norm(name)}`, 'concept', name).id;
        link(`j:${k}`, target, 60);
      }
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export function renderMapa() {
  const head = pageHead({
    eyebrow: 'Mapa',
    title: 'Mira cómo se conectan <span>tus hábitos, metas y días.</span>',
    sub: 'Se arma solo con lo que haces. En el diario escribe <b>[[Nombre]]</b> para crear tus propias conexiones.',
  });
  const g = buildGraph();
  const real = g.nodes.filter((n) => n.kind !== 'hub').length;
  const chips = `<div class="chips map-filters">${KINDS.map(([k, l]) =>
    `<button class="chip toggle${hidden.has(k) ? '' : ' is-on'}" data-action="map-toggle" data-v="${k}" aria-pressed="${!hidden.has(k)}"><i class="legend-dot k-${k}"></i>${l}</button>`).join('')}</div>`;
  if (!real && !hidden.size) {
    return head + emptyState('Tu mapa está vacío', 'Crea hábitos, metas o tareas y escribe en tu diario: aquí verás cómo todo se conecta.');
  }
  return `${head}${chips}
    <section class="graph-wrap" id="graph-wrap">
      <canvas id="graph" aria-label="Mapa de conexiones: ${real} elementos" role="img"></canvas>
      <div class="graph-meta">${real} elementos · ${g.edges.length} conexiones</div>
      <div class="graph-zoom">
        <button class="icon-btn boxed" data-action="map-zoom" data-v="1.25" aria-label="Acercar">${icon('plus')}</button>
        <button class="icon-btn boxed" data-action="map-zoom" data-v="0.8" aria-label="Alejar">${icon('minus')}</button>
        <button class="icon-btn boxed" data-action="map-zoom" data-v="0" aria-label="Centrar">${icon('target')}</button>
      </div>
      <p class="graph-hint">${icon('info')} Arrastra, haz zoom y toca un punto para abrirlo</p>
    </section>`;
}

/* ---------- Simulación y dibujo ---------- */

export function mountMapa(onOpen) {
  if (running) running.stop();
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const wrap = document.getElementById('graph-wrap');
  const ctx = canvas.getContext('2d');
  const { nodes, edges } = buildGraph();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) { neighbors.get(e.a).add(e.b); neighbors.get(e.b).add(e.a); }

  const css = getComputedStyle(document.documentElement);
  const C = {
    text: css.getPropertyValue('--text').trim(),
    muted: css.getPropertyValue('--text-3').trim(),
    faint: css.getPropertyValue('--text-4').trim(),
    dark: state.theme === 'dark',
  };

  const hubAngle = { 'hub:habit': -2.4, 'hub:goal': -0.7, 'hub:task': 0.9, 'hub:journal': 2.6 };
  for (const n of nodes) {
    const saved = positions.get(n.id);
    n.r = radius(n);
    n.charge = n.kind === 'hub' ? 3.2 : n.kind === 'category' || n.kind === 'goal' ? 1.6 : 1;
    if (saved) { n.x = saved.x; n.y = saved.y; }
    else {
      const a = hubAngle[n.id] ?? Math.random() * Math.PI * 2;
      const d = n.kind === 'hub' ? 120 : 160 + Math.random() * 120;
      n.x = Math.cos(a) * d + (Math.random() - 0.5) * 60;
      n.y = Math.sin(a) * d + (Math.random() - 0.5) * 60;
    }
    n.vx = 0; n.vy = 0;
  }

  let W = 0; let H = 0; let dpr = 1;
  const view = { k: 1, x: 0, y: 0 };
  let alpha = positions.size ? 0.5 : 1;
  let hover = null;
  let drag = null;
  let raf = 0;
  let autoFit = true;
  let firstFrame = true;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = wrap.clientWidth; H = wrap.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  };
  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(wrap);
  resize();

  const toWorld = (sx, sy) => ({ x: (sx - W / 2 - view.x) / view.k, y: (sy - H / 2 - view.y) / view.k });
  const pick = (sx, sy) => {
    const p = toWorld(sx, sy);
    let best = null; let bd = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < n.r + 8 / view.k && d < bd) { best = n; bd = d; }
    }
    return best;
  };

  // Encuadre que muestra todo el grafo. ease < 1 = acercarse suavemente.
  function fit(ease = 1) {
    if (!nodes.length || !W) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const k = Math.min(1.6, Math.max(0.25, Math.min((W - 60) / (x1 - x0 + 40 || 1), (H - 110) / (y1 - y0 + 40 || 1))));
    const tx = -((x0 + x1) / 2) * k;
    const ty = -((y0 + y1) / 2) * k + 6;
    view.k += (k - view.k) * ease; view.x += (tx - view.x) * ease; view.y += (ty - view.y) * ease;
  }

  function step() {
    const rep = 2200;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x; let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 250000) continue;
        const f = ((rep * a.charge * b.charge) / d2) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f; const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    for (const e of edges) {
      const a = byId.get(e.a); const b = byId.get(e.b);
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - e.len) / d) * 0.04 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const n of nodes) {
      const g = n.kind === 'hub' ? 0.0015 : 0.003;
      n.vx -= n.x * g * alpha; n.vy -= n.y * g * alpha;
      if (drag && drag.node === n) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0.012, alpha * 0.985);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2 + view.x, H / 2 + view.y);
    ctx.scale(view.k, view.k);
    const focus = hover || drag?.node || null;
    const near = focus ? neighbors.get(focus.id) : null;

    ctx.lineWidth = 1 / view.k;
    for (const e of edges) {
      const a = byId.get(e.a); const b = byId.get(e.b);
      const on = focus && (e.a === focus.id || e.b === focus.id);
      ctx.strokeStyle = on ? C.text : C.muted;
      ctx.globalAlpha = on ? 0.7 : focus ? 0.08 : 0.22;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of nodes) {
      const dim = focus && n !== focus && !near.has(n.id);
      ctx.globalAlpha = dim ? 0.2 : n.done || n.kind === 'journal' ? 0.55 : 1;
      if (C.dark && (n.kind === 'hub' || n.kind === 'goal' || (n.weight || 0) >= 7)) { ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = n.kind === 'hub' ? 18 : 10; }
      ctx.fillStyle = n.kind === 'concept' || n.kind === 'category' ? C.muted : C.text;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (n.kind === 'goal') { ctx.lineWidth = 1.5 / view.k; ctx.strokeStyle = C.text; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of nodes) {
      const show = n === focus || (near && near.has(n.id)) || n.kind === 'hub' || n.kind === 'category' ||
        (view.k > 1.15 && (n.kind === 'habit' || n.kind === 'goal')) || view.k > 1.8;
      if (!show) continue;
      const hub = n.kind === 'hub';
      ctx.font = `${hub ? 600 : 500} ${(hub ? 12.5 : 11) / view.k}px Manrope, system-ui, sans-serif`;
      ctx.fillStyle = hub || n === focus ? C.text : C.muted;
      ctx.globalAlpha = focus && n !== focus && !near.has(n.id) ? 0.25 : 1;
      const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
      ctx.fillText(label, n.x, n.y + n.r + 5 / view.k);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (!canvas.isConnected) { stop(); return; }
    if (alpha > 0.013 || drag) step();
    if (firstFrame) { fit(); firstFrame = false; }
    if (autoFit) { fit(0.12); if (alpha <= 0.013) autoFit = false; }
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* ----- Interacción: arrastrar, mover, zoom, pellizcar ----- */
  const pointers = new Map();
  let pinch = null;
  let moved = 0;
  const rel = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, rel(e));
    moved = 0;
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), k: view.k };
      drag = null;
      return;
    }
    const p = rel(e);
    const n = pick(p.x, p.y);
    drag = n ? { node: n, sx: p.x, sy: p.y } : { pan: true, sx: p.x, sy: p.y, vx: view.x, vy: view.y };
    if (n) alpha = Math.max(alpha, 0.3);
    autoFit = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = rel(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      view.k = Math.min(4, Math.max(0.25, pinch.k * (Math.hypot(p1.x - p2.x, p1.y - p2.y) / pinch.d)));
      return;
    }
    if (drag) {
      moved = Math.max(moved, Math.hypot(p.x - drag.sx, p.y - drag.sy));
      if (drag.node) { const w = toWorld(p.x, p.y); drag.node.x = w.x; drag.node.y = w.y; alpha = Math.max(alpha, 0.25); }
      else { view.x = drag.vx + (p.x - drag.sx); view.y = drag.vy + (p.y - drag.sy); }
      return;
    }
    const n = pick(p.x, p.y);
    if (n !== hover) {
      hover = n;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      const tip = document.getElementById('tip');
      if (n && e.pointerType === 'mouse') {
        tip.textContent = tipText(n);
        tip.classList.add('is-on');
      } else tip.classList.remove('is-on');
    }
    if (hover && e.pointerType === 'mouse') {
      const tip = document.getElementById('tip');
      tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12)}px`;
      tip.style.top = `${e.clientY - tip.offsetHeight - 12}px`;
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag?.node && moved < 5) onOpen(drag.node);
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hover = null; document.getElementById('tip').classList.remove('is-on'); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = rel(e);
    const k = Math.min(4, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015)));
    const w = toWorld(p.x, p.y);
    view.x = p.x - W / 2 - w.x * k; view.y = p.y - H / 2 - w.y * k; view.k = k;
    autoFit = false;
  }, { passive: false });

  function stop() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    for (const n of nodes) positions.set(n.id, { x: n.x, y: n.y });
    running = null;
  }

  running = {
    stop,
    zoom: (f) => {
      if (!f) { fit(); return; }
      view.k = Math.min(4, Math.max(0.25, view.k * f)); view.x *= f; view.y *= f;
    },
  };
  canvas.style.cursor = 'grab';
  raf = requestAnimationFrame(loop);
}

export const zoomMapa = (f) => running?.zoom(f);

function radius(n) {
  switch (n.kind) {
    case 'hub': return 9;
    case 'habit': return 4.5 + Math.min(n.weight || 0, 30) / 5;
    case 'goal': return 6.5;
    case 'category': return 5.5;
    case 'concept': return 4.5;
    case 'journal': return 3.5;
    default: return 3;
  }
}

function tipText(n) {
  const kind = { hub: 'Grupo', habit: 'Hábito', goal: 'Meta', category: 'Categoría', task: 'Tarea', journal: 'Diario', concept: 'Idea' }[n.kind];
  const extra = n.kind === 'habit' && n.weight ? ` · 🔥 ${n.weight}` : n.done ? ' · hecho' : '';
  return `${kind}: ${n.label}${extra}`;
}
