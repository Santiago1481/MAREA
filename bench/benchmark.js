/**
 * Banco de pruebas de MAREA. Reproducible (semillas fijas).
 *   E1  Escalabilidad por estrategia y tamaño de ciudad
 *   E2  Caché (Proxy) con demanda Zipf — rutas calientes
 *   E3  Tráfico dinámico (Observer): invalidación selectiva y frescura
 *   E4  Extremo a extremo: AS-IS (legacy, sin caché) vs TO-BE (adaptativa + caché)
 * Salida: results/results.json + tabla en consola.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import {
  generateCity,
  randomPairs,
  createRng,
  createZipf,
  StrategyFactory,
  Router,
  CachedRouter,
  TrafficService,
} from '../src/index.js';

const EPS = 1e-6;
const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean, p50: q(0.5), p95: q(0.95), max: s.at(-1) };
};
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const log = (...a) => console.log(...a);

const results = {
  meta: {
    date: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model?.trim(),
    note: 'Tiempos en milisegundos; "expandidos" = nodos extraídos de la cola de prioridad.',
  },
};

// ───────────────────────── E1 Escalabilidad ─────────────────────────
log('\nE1 · Escalabilidad');
const SIZES = [60, 100, 140, 200];
const KEYS = ['legacy', 'dijkstra', 'bidirectional', 'astar', 'alt', 'adaptive'];
results.scalability = [];
for (const size of SIZES) {
  const g = generateCity({ size, seed: 42 });
  const f = new StrategyFactory({ landmarks: 8 });
  const lm = f.create('alt').prepare(g);
  const pairs = randomPairs(g, 150, createRng(size), Math.floor(size * 0.3));
  const ref = pairs.map(([a, b]) => f.create('dijkstra').findPath(g, a, b).cost);
  const row = {
    size,
    nodes: g.size,
    edges: g.edges.length,
    altPreprocessMs: round(lm.preprocessMs, 1),
    altMemoryKB: round((lm.dists.length * g.size * 8) / 1024, 0),
    strategies: {},
  };
  for (const key of KEYS) {
    const s = f.create(key);
    const qs = key === 'legacy' ? pairs.slice(0, 40) : pairs;
    for (const [a, b] of qs.slice(0, 10)) s.findPath(g, a, b); // calentamiento JIT
    const ms = [];
    const exp = [];
    let maxGap = 0;
    qs.forEach(([a, b], i) => {
      const t0 = performance.now();
      const r = s.findPath(g, a, b);
      ms.push(performance.now() - t0);
      exp.push(r.expanded);
      maxGap = Math.max(maxGap, Math.abs(r.cost - ref[i]) / ref[i]);
    });
    const t = stats(ms);
    row.strategies[key] = {
      queries: qs.length,
      meanMs: round(t.mean),
      p50Ms: round(t.p50),
      p95Ms: round(t.p95),
      meanExpanded: Math.round(stats(exp).mean),
      maxOptimalityGap: maxGap,
    };
  }
  results.scalability.push(row);
  log(
    `  ${size}x${size} · ${g.size} nodos · ` +
      KEYS.map((k) => `${k}=${row.strategies[k].meanMs.toFixed(2)}ms/${row.strategies[k].meanExpanded}`).join('  ')
  );
}

// Ciudad de referencia para E2-E4
const SIZE = 140;

function zipfWorkload(g, { pool = 400, requests = 3000, s = 1.0, seed = 77 }) {
  const rng = createRng(seed);
  const pairs = randomPairs(g, pool, rng, 15);
  const z = createZipf(pool, s, rng);
  return Array.from({ length: requests }, () => pairs[z()]);
}

// ───────────────────────── E2 Caché ─────────────────────────
log('\nE2 · Caché LRU con demanda Zipf');
{
  const g = generateCity({ size: SIZE, seed: 42 });
  const f = new StrategyFactory();
  f.create('alt').prepare(g);
  const work = zipfWorkload(g, {});
  results.cache = [];
  for (const capacity of [0, 50, 100, 200, 400]) {
    const router = new Router(g, f.create('adaptive'));
    const target = capacity ? new CachedRouter(router, { capacity }) : router;
    const ms = [];
    const t0 = performance.now();
    for (const [a, b] of work) {
      const t = performance.now();
      target.route(a, b);
      ms.push(performance.now() - t);
    }
    const total = performance.now() - t0;
    const st = stats(ms);
    const row = {
      capacity,
      requests: work.length,
      hitRatio: capacity ? round(target.hitRatio, 4) : 0,
      totalMs: round(total, 1),
      meanMs: round(st.mean, 4),
      p95Ms: round(st.p95, 4),
      throughputRps: Math.round(work.length / (total / 1000)),
    };
    results.cache.push(row);
    log(`  capacidad=${capacity}  hit=${(row.hitRatio * 100).toFixed(1)}%  media=${row.meanMs}ms  ${row.throughputRps} rutas/s`);
  }
}

// ───────────────────────── E3 Tráfico dinámico ─────────────────────────
log('\nE3 · Tráfico dinámico + invalidación selectiva');
{
  const g = generateCity({ size: SIZE, seed: 42 });
  const f = new StrategyFactory();
  f.create('alt').prepare(g);
  const work = zipfWorkload(g, { seed: 91 });
  const rng = createRng(5);
  const policies = {};
  const altH = f.create('alt').heuristicFor(g);
  for (const policy of ['vaciado-total', 'selectiva', 'selectiva+cotas-ALT']) {
    for (const e of g.edges) e.factor = 1;
    const router = new Router(g, f.create('adaptive'));
    const cache = new CachedRouter(router, {
      capacity: 400,
      lowerBound: policy === 'selectiva+cotas-ALT' ? altH : null,
    });
    const traffic = new TrafficService(g);
    if (policy === 'vaciado-total') {
      traffic.subscribe({
        onTrafficEvent: () => {
          cache.stats.invalidated += cache.lru.size;
          cache.stats.flushes++;
          cache.clear();
        },
      });
    } else traffic.subscribe(cache);
    const r2 = createRng(5);
    let stale = 0;
    let checked = 0;
    let incidents = 0;
    const active = [];
    const ms = [];
    work.forEach(([a, b], i) => {
      if (i % 100 === 50) {
        const seg = traffic.pickSegment(r2, { length: 6 });
        active.push({ evt: traffic.setCongestion(seg, 2 + r2.int(4)), until: i + 300 });
        incidents++;
      }
      while (active.length && active[0].until <= i) traffic.restore(active.shift().evt.changes);
      const t = performance.now();
      const r = cache.route(a, b);
      ms.push(performance.now() - t);
      if (i % 3 === 0) {
        checked++;
        const ref = f.create('dijkstra').findPath(g, a, b).cost;
        if (Math.abs(r.cost - g.pathCost(r.edges)) > EPS || Math.abs(g.pathCost(r.edges) - ref) > EPS) stale++;
      }
    });
    const st = stats(ms);
    policies[policy] = {
      requests: work.length,
      incidents,
      hitRatio: round(cache.hitRatio, 4),
      invalidated: cache.stats.invalidated,
      flushes: cache.stats.flushes,
      meanMs: round(st.mean, 4),
      p95Ms: round(st.p95, 4),
      checked,
      staleResponses: stale,
    };
    log(`  ${policy}: hit=${(cache.hitRatio * 100).toFixed(1)}%  invalidadas=${cache.stats.invalidated}  rutas obsoletas=${stale}/${checked}`);
  }
  void rng;
  results.traffic = policies;
}

// ───────────────────────── E4 Extremo a extremo ─────────────────────────
log('\nE4 · AS-IS vs TO-BE (1000 solicitudes Zipf)');
{
  const g = generateCity({ size: SIZE, seed: 42 });
  const f = new StrategyFactory();
  const prep = f.create('alt').prepare(g);
  const work = zipfWorkload(g, { requests: 1000, seed: 123 });
  const run = (target) => {
    const ms = [];
    const t0 = performance.now();
    for (const [a, b] of work) {
      const t = performance.now();
      target.route(a, b);
      ms.push(performance.now() - t);
    }
    return { total: performance.now() - t0, ...stats(ms) };
  };
  const asis = run(new Router(g, f.create('legacy')));
  const tobeNoCache = run(new Router(g, f.create('adaptive')));
  const tobe = run(new CachedRouter(new Router(g, f.create('adaptive')), { capacity: 400 }));
  const fmt = (x) => ({
    totalMs: round(x.total, 1),
    meanMs: round(x.mean, 4),
    p50Ms: round(x.p50, 4),
    p95Ms: round(x.p95, 4),
    maxMs: round(x.max, 3),
    throughputRps: Math.round(work.length / (x.total / 1000)),
  });
  results.endToEnd = {
    requests: work.length,
    altPreprocessMs: round(prep.preprocessMs, 1),
    asis: fmt(asis),
    tobeNoCache: fmt(tobeNoCache),
    tobe: fmt(tobe),
    speedupMean: round(asis.mean / tobe.mean, 1),
    speedupP95: round(asis.p95 / tobe.p95, 1),
  };
  log(`  AS-IS media=${asis.mean.toFixed(2)}ms p95=${asis.p95.toFixed(2)}ms`);
  log(`  TO-BE sin caché media=${tobeNoCache.mean.toFixed(3)}ms`);
  log(`  TO-BE media=${tobe.mean.toFixed(4)}ms p95=${tobe.p95.toFixed(4)}ms  → ×${results.endToEnd.speedupMean} (media)`);
}

mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/results.json', import.meta.url), JSON.stringify(results, null, 2));
log('\n✓ results/results.json');
