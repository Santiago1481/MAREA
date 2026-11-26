import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MinHeap,
  createRng,
  generateCity,
  randomPairs,
  StrategyFactory,
  Router,
  CachedRouter,
  TrafficService,
  NavigationSystem,
  RouteIterator,
  manhattanHeuristic,
} from '../src/index.js';

const EPS = 1e-6;

test('MinHeap extrae en orden creciente', () => {
  const h = new MinHeap();
  const rng = createRng(1);
  const vals = Array.from({ length: 500 }, () => rng() * 1000);
  vals.forEach((v, i) => h.push(v, i));
  let last = -Infinity;
  while (h.size) {
    const i = h.pop();
    assert.ok(vals[i] >= last);
    last = vals[i];
  }
});

test('Todas las estrategias encuentran rutas de costo óptimo (vs. Dijkstra)', () => {
  const g = generateCity({ size: 48, seed: 7 });
  const f = new StrategyFactory({ landmarks: 6 });
  const pairs = randomPairs(g, 120, createRng(3));
  const ref = f.create('dijkstra');
  for (const key of ['legacy', 'bidirectional', 'astar', 'alt', 'adaptive']) {
    const s = f.create(key);
    for (const [a, b] of pairs) {
      const r0 = ref.findPath(g, a, b);
      const r1 = s.findPath(g, a, b);
      assert.ok(r1.found, `${key} no encontró ruta`);
      assert.ok(Math.abs(r0.cost - r1.cost) < EPS, `${key}: ${r1.cost} != ${r0.cost}`);
      // la ruta es un camino válido y contiguo
      assert.equal(r1.path[0], a);
      assert.equal(r1.path.at(-1), b);
      for (let i = 0; i < r1.edges.length; i++) {
        assert.equal(g.other(r1.edges[i], r1.path[i]), r1.path[i + 1]);
      }
    }
  }
});

test('Optimalidad se mantiene con congestión (heurísticas siguen siendo admisibles)', () => {
  const g = generateCity({ size: 40, seed: 11 });
  const f = new StrategyFactory({ landmarks: 6 });
  f.create('alt').prepare(g); // landmarks sobre flujo libre
  const rng = createRng(5);
  for (const e of g.edges) if (rng() < 0.3) e.factor = 1 + rng() * 5;
  const pairs = randomPairs(g, 80, rng);
  for (const [a, b] of pairs) {
    const ref = f.create('dijkstra').findPath(g, a, b).cost;
    for (const key of ['astar', 'alt', 'bidirectional']) {
      assert.ok(Math.abs(f.create(key).findPath(g, a, b).cost - ref) < EPS, key);
    }
  }
});

test('A* y ALT expanden menos nodos que Dijkstra en promedio', () => {
  const g = generateCity({ size: 80, seed: 42 });
  const f = new StrategyFactory();
  const pairs = randomPairs(g, 60, createRng(9), 40);
  const sum = (k) => pairs.reduce((acc, [a, b]) => acc + f.create(k).findPath(g, a, b).expanded, 0);
  const d = sum('dijkstra');
  const a = sum('astar');
  const l = sum('alt');
  assert.ok(a < d, `A* ${a} >= Dijkstra ${d}`);
  assert.ok(l < a, `ALT ${l} >= A* ${a}`);
});

test('Heurística Manhattan es admisible', () => {
  const g = generateCity({ size: 40, seed: 2 });
  const h = manhattanHeuristic(g);
  const f = new StrategyFactory();
  for (const [a, b] of randomPairs(g, 50, createRng(4))) {
    assert.ok(h(a, b) <= f.create('dijkstra').findPath(g, a, b).cost + EPS);
  }
});

test('Proxy de caché: hit, invalidación selectiva y vaciado ante mejoras', () => {
  const g = generateCity({ size: 40, seed: 3 });
  const f = new StrategyFactory();
  const router = new Router(g, f.create('astar'));
  const cache = new CachedRouter(router);
  const traffic = new TrafficService(g);
  traffic.subscribe(cache);
  const [[a, b], [c, d]] = randomPairs(g, 2, createRng(8), 20);
  const r1 = cache.route(a, b);
  assert.equal(r1.cacheHit, false);
  assert.equal(cache.route(a, b).cacheHit, true);
  cache.route(c, d);

  // encarecer una arista de la ruta a→b invalida solo esa ruta
  const e = r1.edges[Math.floor(r1.edges.length / 2)];
  const other = cache.lru.get(cache.key(c, d));
  const shared = other.edges.includes(e);
  const evt = traffic.setCongestion([e], 5);
  assert.equal(cache.lru.has(cache.key(a, b)), false);
  assert.equal(cache.lru.has(cache.key(c, d)), !shared);

  // la nueva ruta es óptima con el tráfico actual
  const fresh = cache.route(a, b);
  const ref = f.create('dijkstra').findPath(g, a, b);
  assert.ok(Math.abs(fresh.cost - ref.cost) < EPS);

  // restaurar (abaratar) vacía la caché completa
  traffic.restore(evt.changes);
  assert.equal(cache.lru.size, 0);
});

test('Caché con cotas ALT conserva rutas al terminar un incidente y todas siguen óptimas', () => {
  const g = generateCity({ size: 60, seed: 21 });
  const f = new StrategyFactory();
  const alt = f.create('alt');
  const cache = new CachedRouter(new Router(g, alt), { lowerBound: alt.heuristicFor(g) });
  const traffic = new TrafficService(g);
  traffic.subscribe(cache);
  const rng = createRng(31);
  const evt = traffic.setCongestion(traffic.pickSegment(rng, { length: 8 }), 5);
  for (const [a, b] of randomPairs(g, 150, rng, 10)) cache.route(a, b);
  const before = cache.lru.size;
  traffic.restore(evt.changes);
  assert.ok(cache.lru.size > 0 && cache.lru.size <= before, 'debería conservar parte de la caché');
  for (const r of cache.lru.values()) {
    const ref = f.create('dijkstra').findPath(g, r.source, r.target).cost;
    assert.ok(Math.abs(r.cost - ref) < EPS, 'ruta conservada no óptima');
  }
});

test('Caché LRU respeta la capacidad', () => {
  const g = generateCity({ size: 30, seed: 3 });
  const cache = new CachedRouter(new Router(g, new StrategyFactory().create('astar')), { capacity: 5 });
  for (const [a, b] of randomPairs(g, 20, createRng(1))) cache.route(a, b);
  assert.equal(cache.lru.size, 5);
  assert.equal(cache.stats.evictions, 15);
});

test('Command: deshacer cambio de estrategia e incidente de tráfico', () => {
  const nav = new NavigationSystem({ size: 40, seed: 5, strategy: 'astar' });
  const before = nav.router.strategy;
  nav.setStrategy('dijkstra');
  assert.notEqual(nav.router.strategy, before);
  nav.undo();
  assert.equal(nav.router.strategy, before);

  const [[a, b]] = randomPairs(nav.graph, 1, createRng(2), 20);
  nav.route(a, b);
  const evt = nav.injectIncident({ factor: 4 });
  const changed = evt.changes.map((c) => c.edgeId);
  assert.ok(changed.every((id) => nav.graph.edges[id].factor === 4));
  nav.undo();
  assert.ok(changed.every((id) => nav.graph.edges[id].factor === 1));
});

test('Observer: la sesión activa se re-rutea si un incidente toca su ruta', () => {
  let rerouted = null;
  const nav = new NavigationSystem({ size: 50, seed: 9, strategy: 'astar', onReroute: (i) => (rerouted = i) });
  const [[a, b]] = randomPairs(nav.graph, 1, createRng(6), 30);
  const r = nav.route(a, b);
  nav.injectIncident({ factor: 6, onActiveRoute: true });
  assert.ok(rerouted, 'no hubo re-ruteo');
  assert.ok(rerouted.after.cost >= r.cost - EPS); // nada se abarató
  const ref = nav.factory.create('dijkstra').findPath(nav.graph, a, b);
  assert.ok(Math.abs(rerouted.after.cost - ref.cost) < EPS);
});

test('Iterator: instrucciones giro a giro cubren toda la distancia', () => {
  const nav = new NavigationSystem({ size: 40, seed: 1 });
  const [[a, b]] = randomPairs(nav.graph, 1, createRng(12), 25);
  const r = nav.route(a, b);
  const steps = [...new RouteIterator(nav.graph, r)];
  assert.equal(steps.at(-1).type, 'arrive');
  assert.equal(steps[0].type, 'start');
  const total = steps.reduce((acc, s) => acc + s.distance, 0);
  assert.equal(total, r.distance);
});

test('Bidireccional: origen = destino', () => {
  const g = generateCity({ size: 20, seed: 1 });
  const r = new StrategyFactory().create('bidirectional').findPath(g, g.meta.mainComponent[0], g.meta.mainComponent[0]);
  assert.equal(r.cost, 0);
  assert.equal(r.found, true);
});
