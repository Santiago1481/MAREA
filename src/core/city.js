import { Graph } from './graph.js';
import { createRng } from './rng.js';

/**
 * Genera una ciudad sintética en retícula (estilo calles/carreras) atravesada
 * por un río sinuoso que solo se cruza por puentes: el escenario de "mareas"
 * donde los puentes concentran el tráfico y castigan las estrategias ingenuas.
 *
 * - Celda = 100 m. Calles/carreras a 30 km/h, avenidas a 60 km/h, puentes a 40 km/h.
 * - ~7 % de manzanas bloqueadas (parques, obras) para romper la regularidad.
 */
export function generateCity({
  size = 100,
  seed = 42,
  blockedRatio = 0.07,
  avenueEvery = 8,
  bridgeEvery = 14,
  cellMeters = 100,
} = {}) {
  const rng = createRng(seed);
  const g = new Graph();
  const cells = new Int32Array(size * size).fill(-1);
  const terrain = new Uint8Array(size * size); // 0 tierra, 1 agua, 2 puente, 3 bloqueado

  const riverCenter = (r) => size * 0.56 + Math.sin((r / size) * Math.PI * 3) * size * 0.09;
  const riverHalf = Math.max(1.5, size * 0.022);
  const isAvenueRow = (r) => r % avenueEvery === 0;
  const isAvenueCol = (c) => c % avenueEvery === 0;
  const isBridgeRow = (r) => r % bridgeEvery === Math.floor(bridgeEvery / 2);

  for (let r = 0; r < size; r++) {
    const cx = riverCenter(r);
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      if (Math.abs(c - cx) <= riverHalf) {
        terrain[idx] = isBridgeRow(r) ? 2 : 1;
        if (terrain[idx] === 1) continue;
      } else if (!isAvenueRow(r) && !isAvenueCol(c) && rng() < blockedRatio) {
        terrain[idx] = 3;
        continue;
      }
      cells[idx] = g.addNode(c, r, { bridge: terrain[idx] === 2 });
    }
  }

  const lines = new Map();
  const addToLine = (name, id) => {
    if (!lines.has(name)) lines.set(name, []);
    lines.get(name).push(id);
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const a = cells[r * size + c];
      if (a < 0) continue;
      // Horizontal (a lo largo de la Calle r)
      if (c + 1 < size) {
        const b = cells[r * size + c + 1];
        if (b >= 0) {
          const bridge = terrain[r * size + c] === 2 || terrain[r * size + c + 1] === 2;
          const avenue = isAvenueRow(r);
          const kind = bridge ? 'bridge' : avenue ? 'avenue' : 'street';
          const name = bridge ? `Puente de la Calle ${r}` : avenue ? `Av. Calle ${r}` : `Calle ${r}`;
          const speedKmh = bridge ? 40 : avenue ? 60 : 30;
          const id = g.addEdge(a, b, { length: cellMeters, speedKmh, name, kind, line: `C${r}`, pos: c });
          addToLine(`C${r}`, id);
        }
      }
      // Vertical (a lo largo de la Carrera c)
      if (r + 1 < size) {
        const b = cells[(r + 1) * size + c];
        if (b >= 0) {
          const avenue = isAvenueCol(c);
          const kind = avenue ? 'avenue' : 'street';
          const name = avenue ? `Av. Carrera ${c}` : `Carrera ${c}`;
          const speedKmh = avenue ? 60 : 30;
          const id = g.addEdge(a, b, { length: cellMeters, speedKmh, name, kind, line: `K${c}`, pos: r });
          addToLine(`K${c}`, id);
        }
      }
    }
  }

  // Componente conexa principal: los pares origen-destino se toman de aquí.
  const comp = new Int32Array(g.size).fill(-1);
  let best = [];
  for (let s = 0; s < g.size; s++) {
    if (comp[s] >= 0) continue;
    const members = [s];
    comp[s] = s;
    for (let i = 0; i < members.length; i++) {
      const u = members[i];
      for (const eid of g.adj[u]) {
        const v = g.other(eid, u);
        if (comp[v] < 0) {
          comp[v] = s;
          members.push(v);
        }
      }
    }
    if (members.length > best.length) best = members;
  }

  for (const ids of lines.values()) ids.sort((x, y) => g.edges[x].pos - g.edges[y].pos);

  g.meta = {
    size,
    seed,
    cellMeters,
    maxSpeedKmh: 60,
    cells,
    terrain,
    lines,
    mainComponent: best,
    inMain: (() => {
      const m = new Uint8Array(g.size);
      for (const v of best) m[v] = 1;
      return m;
    })(),
  };
  return g;
}

/** Pares origen-destino aleatorios (reproducibles) dentro de la componente principal. */
export function randomPairs(graph, count, rng, minCells = 0) {
  const pool = graph.meta.mainComponent;
  const pairs = [];
  while (pairs.length < count) {
    const s = rng.pick(pool);
    const t = rng.pick(pool);
    if (s === t) continue;
    const a = graph.nodes[s];
    const b = graph.nodes[t];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < minCells) continue;
    pairs.push([s, t]);
  }
  return pairs;
}
