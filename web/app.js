import { NavigationSystem, STRATEGY_LABELS, fmtDistance, fmtDuration } from '../src/index.js';

const SIZE = 100;
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const CELL = canvas.width / SIZE;
const $ = (id) => document.getElementById(id);

const COLORS = {
  bg: '#080b10',
  land: '#0b1017',
  blocked: '#06080c',
  water: '#0a2433',
  street: '#1a2431',
  avenue: '#33435a',
  bridge: '#67e8f9',
  explored: 'rgba(34, 211, 238, 0.22)',
  exploredB: 'rgba(167, 139, 250, 0.22)',
  jam: '#f43f5e',
};

const state = { origin: null, dest: null, route: null, anim: 0, compare: null, rerouteFrom: null };

const nav = new NavigationSystem({
  size: SIZE,
  seed: 42,
  strategy: 'adaptive',
  onReroute: ({ before, after, affectedEdges }) => {
    state.rerouteFrom = before;
    $('compareBox').hidden = true;
    log(
      `↻ Re-ruteo automático: ${affectedEdges} tramos afectados · ${fmtDuration(before.cost)} → ${fmtDuration(after.cost)}`,
      'reroute'
    );
    show(after, { animate: true });
  },
});
const g = nav.graph;

// ───────────── capa base (pre-renderizada) ─────────────
const base = document.createElement('canvas');
base.width = canvas.width;
base.height = canvas.height;
function renderBase() {
  const b = base.getContext('2d');
  b.fillStyle = COLORS.bg;
  b.fillRect(0, 0, base.width, base.height);
  const { terrain } = g.meta;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = terrain[r * SIZE + c];
      b.fillStyle = t === 1 ? COLORS.water : t === 3 ? COLORS.blocked : COLORS.land;
      b.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  // brillo del río
  b.save();
  b.globalCompositeOperation = 'lighter';
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (terrain[r * SIZE + c] === 1) {
        b.fillStyle = 'rgba(34,211,238,0.05)';
        b.fillRect(c * CELL - 2, r * CELL - 2, CELL + 4, CELL + 4);
      }
  b.restore();
  for (const kind of ['street', 'avenue', 'bridge']) {
    b.strokeStyle = COLORS[kind];
    b.lineWidth = kind === 'street' ? 1 : kind === 'avenue' ? 2.2 : 2.6;
    b.beginPath();
    for (const e of g.edges) {
      if (e.kind !== kind) continue;
      const a = g.nodes[e.u];
      const z = g.nodes[e.v];
      b.moveTo(cx(a.x), cx(a.y));
      b.lineTo(cx(z.x), cx(z.y));
    }
    b.stroke();
  }
}
const cx = (v) => v * CELL + CELL / 2;

// ───────────── dibujo ─────────────
function draw(progress = 1) {
  ctx.drawImage(base, 0, 0);
  const r = state.route;
  if (r?.trace && $('chkTrace').checked) {
    const n = Math.floor(r.trace.length * Math.min(1, progress));
    for (let i = 0; i < n; i++) {
      const p = g.nodes[r.trace[i]];
      ctx.fillStyle = r.strategy.includes('bidireccional') && i % 2 ? COLORS.exploredB : COLORS.explored;
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  if (state.rerouteFrom && progress >= 1) drawPath(state.rerouteFrom, 'rgba(251,191,36,0.7)', 2, [5, 5]);
  if (r?.found && progress >= 1) drawPath(r, null, 3.4);
  drawJams();
  marker(state.origin, '#22d3ee');
  marker(state.dest, '#a78bfa');
}

function drawJams() {
  ctx.save();
  ctx.strokeStyle = COLORS.jam;
  ctx.lineWidth = 4;
  ctx.shadowColor = COLORS.jam;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (const e of g.edges) {
    if (e.factor <= 1) continue;
    const a = g.nodes[e.u];
    const z = g.nodes[e.v];
    ctx.moveTo(cx(a.x), cx(a.y));
    ctx.lineTo(cx(z.x), cx(z.y));
  }
  ctx.stroke();
  ctx.restore();
}

function drawPath(route, color, width, dash = []) {
  ctx.save();
  const a = g.nodes[route.path[0]];
  const z = g.nodes[route.path.at(-1)];
  const grad = ctx.createLinearGradient(cx(a.x), cx(a.y), cx(z.x), cx(z.y));
  grad.addColorStop(0, '#22d3ee');
  grad.addColorStop(1, '#a78bfa');
  ctx.strokeStyle = color ?? grad;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  if (!color) {
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  route.path.forEach((id, i) => {
    const p = g.nodes[id];
    i ? ctx.lineTo(cx(p.x), cx(p.y)) : ctx.moveTo(cx(p.x), cx(p.y));
  });
  ctx.stroke();
  ctx.restore();
}

function marker(id, color) {
  if (id == null) return;
  const p = g.nodes[id];
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx(p.x), cx(p.y), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function animate() {
  cancelAnimationFrame(state.anim);
  const r = state.route;
  if (state.noAnim || !r?.trace || !$('chkTrace').checked) return draw(1);
  const duration = Math.min(1400, 300 + r.trace.length * 0.6);
  const t0 = performance.now();
  const step = (t) => {
    const p = (t - t0) / duration;
    draw(p);
    if (p < 1) state.anim = requestAnimationFrame(step);
  };
  state.anim = requestAnimationFrame(step);
}

// ───────────── UI ─────────────
function show(route, { animate: anim = true } = {}) {
  state.route = route;
  $('kMs').textContent = route.cacheHit ? `${route.ms.toFixed(3)} ms` : `${route.ms.toFixed(2)} ms`;
  $('kExp').textContent = route.expanded.toLocaleString('es-CO');
  $('kTime').textContent = route.found ? fmtDuration(route.cost) : '—';
  $('kDist').textContent = route.found ? fmtDistance(route.distance) : '—';
  const s = nav.cache.stats;
  $('kCache').textContent = `${s.hits} hits · ${s.misses} miss · ${(nav.cache.hitRatio * 100).toFixed(0)}%`;
  $('status').textContent = route.cacheHit ? `⚡ respuesta desde caché · ${route.strategy}` : route.strategy;
  const dl = $('directions');
  dl.innerHTML = '';
  for (const step of nav.directions(route)) {
    const li = document.createElement('li');
    li.textContent = step.instruction;
    dl.append(li);
  }
  $('btnUndo').disabled = !nav.bus.canUndo;
  anim ? animate() : draw(1);
}

function log(text, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  li.textContent = `${new Date().toLocaleTimeString('es-CO')}  ${text}`;
  $('log').prepend(li);
}

function requestRoute() {
  if (state.origin == null || state.dest == null) return;
  state.rerouteFrom = null;
  $('compareBox').hidden = true;
  const r = nav.route(state.origin, state.dest, { trace: true });
  log(`→ ${r.cacheHit ? 'HIT caché' : r.strategy}: ${fmtDuration(r.cost)} · ${r.expanded} nodos`, 'route');
  show(r);
}

function renderStrategies() {
  const box = $('strategies');
  box.innerHTML = '';
  for (const key of ['legacy', 'dijkstra', 'bidirectional', 'astar', 'alt', 'adaptive']) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(nav.strategyKey === key));
    b.innerHTML = `<span>${STRATEGY_LABELS[key]}</span><small>${key === 'legacy' ? 'AS-IS' : key === 'adaptive' ? 'TO-BE' : ''}</small>`;
    b.onclick = () => {
      nav.setStrategy(key);
      log(`⚙ Estrategia → ${STRATEGY_LABELS[key]}`);
      renderStrategies();
      requestRoute();
    };
    box.append(b);
  }
}

function nearestNode(px, py) {
  const c0 = Math.floor(px / CELL);
  const r0 = Math.floor(py / CELL);
  for (let rad = 0; rad < 6; rad++) {
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) continue;
        const id = g.meta.cells[r * SIZE + c];
        if (id >= 0 && g.meta.inMain[id]) return id;
      }
    }
  }
  return null;
}

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  const id = nearestNode(x, y);
  if (id == null) return;
  if (state.origin == null || state.dest != null) {
    state.origin = id;
    state.dest = null;
    state.route = null;
    state.rerouteFrom = null;
    draw();
  } else {
    state.dest = id;
    requestRoute();
  }
});

$('btnRandom').onclick = () => {
  const pool = g.meta.mainComponent;
  let a, b;
  do {
    a = pool[Math.floor(Math.random() * pool.length)];
    b = pool[Math.floor(Math.random() * pool.length)];
  } while (Math.abs(g.nodes[a].x - g.nodes[b].x) + Math.abs(g.nodes[a].y - g.nodes[b].y) < SIZE * 0.6);
  state.origin = a;
  state.dest = b;
  requestRoute();
};

$('btnIncident').onclick = () => {
  if (!state.route?.found) return log('Primero trace una ruta.');
  const evt = nav.injectIncident({ factor: 8, length: 10 });
  log(`⚠ ${evt.label} · caché invalidó ${nav.cache.stats.invalidated} rutas acumuladas`, 'traffic');
  if (!state.rerouteFrom) draw();
  $('btnUndo').disabled = !nav.bus.canUndo;
};

$('btnUndo').onclick = () => {
  const cmd = nav.undo();
  if (!cmd) return;
  log(`↶ Deshacer: ${cmd.label}`);
  renderStrategies();
  state.rerouteFrom = null;
  requestRoute();
  draw();
};

$('btnCompare').onclick = () => {
  if (state.origin == null || state.dest == null) $('btnRandom').onclick();
  const rows = nav.compare(state.origin, state.dest);
  const maxExp = Math.max(...rows.map((r) => r.expanded));
  const t = $('cmp');
  t.innerHTML = '<tr><th>Estrategia</th><th>ms</th><th>nodos</th><th>viaje</th></tr>';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${STRATEGY_LABELS[r.key]}<div class="bar" style="width:${(r.expanded / maxExp) * 100}%"></div></td>
      <td>${r.ms.toFixed(2)}</td><td>${r.expanded}</td><td>${fmtDuration(r.cost)}</td>`;
    tr.onclick = () => show(r);
    t.append(tr);
  }
  $('compareBox').hidden = false;
  log(`⇄ Comparativa: mismas rutas óptimas (${fmtDuration(rows[0].cost)}), ${maxExp} → ${Math.min(...rows.map((r) => r.expanded))} nodos`);
  show(rows.at(-1));
};

$('chkTrace').onchange = () => draw();

// ───────────── arranque ─────────────
renderBase();
renderStrategies();
draw();
const t0 = performance.now();
const lm = nav.warmUp();
$('status').textContent = `listo · ${g.size.toLocaleString('es-CO')} intersecciones · ${lm.ids.length} landmarks en ${(performance.now() - t0).toFixed(0)} ms`;
log(`Ciudad ${SIZE}×${SIZE} generada · ${g.edges.length.toLocaleString('es-CO')} tramos viales`);
$('btnUndo').disabled = true;

// Modo demo determinista (capturas / video): ?demo=compare | ?demo=incident
const demo = new URLSearchParams(location.search).get('demo');
if (demo) {
  state.noAnim = true;
  state.origin = nearestNode(cx(6), cx(12));
  state.dest = nearestNode(cx(92), cx(86));
  if (demo === 'compare') $('btnCompare').onclick();
  else {
    requestRoute();
    if (demo === 'incident') $('btnIncident').onclick();
  }
} else {
  $('btnRandom').onclick();
}
