import { AStarStrategy, manhattanHeuristic } from './astar.js';
import { shortestPathTree } from './dijkstra.js';

/**
 * Selección de landmarks por "punto más lejano" sobre costos a flujo libre.
 * Devuelve { ids, dists[] } donde dists[i][v] = d_libre(landmark_i, v).
 */
export function selectLandmarks(graph, k = 8) {
  const pool = graph.meta.mainComponent;
  const ids = [];
  const dists = [];
  const minD = new Float64Array(graph.size).fill(Infinity);
  // Arranque: el nodo más lejano a un nodo arbitrario de la componente.
  let seedDist = shortestPathTree(graph, pool[0]);
  let next = argmax(pool, seedDist);
  for (let i = 0; i < k; i++) {
    ids.push(next);
    const d = shortestPathTree(graph, next);
    dists.push(d);
    for (const v of pool) if (d[v] < minD[v]) minD[v] = d[v];
    next = argmax(pool, minD);
  }
  seedDist = null;
  return { ids, dists };
}

function argmax(pool, arr) {
  let best = pool[0];
  for (const v of pool) if (Number.isFinite(arr[v]) && arr[v] > arr[best]) best = v;
  return best;
}

/**
 * ALT = A* + Landmarks + desigualdad Triangular (Goldberg & Harrelson, 2005).
 * h(v) = max_L |d(L,t) − d(L,v)|, combinada con Manhattan mediante max().
 * Precalcular sobre flujo libre es la decisión arquitectónica clave: como la
 * congestión solo encarece aristas, la cota sigue siendo admisible y NO hay
 * que recalcular landmarks ante cada evento de tráfico.
 */
export class ALTStrategy extends AStarStrategy {
  constructor(k = 8) {
    super((graph) => {
      const { dists } = this.landmarksFor(graph);
      const manhattan = manhattanHeuristic(graph);
      const L = dists.length;
      return (v, t) => {
        let best = manhattan(v, t);
        for (let i = 0; i < L; i++) {
          const d = dists[i];
          const diff = d[t] - d[v];
          const b = diff < 0 ? -diff : diff;
          if (b > best) best = b;
        }
        return best;
      };
    }, 'ALT (A*+Landmarks)');
    this.k = k;
    this._landmarks = new WeakMap();
  }

  landmarksFor(graph) {
    let lm = this._landmarks.get(graph);
    if (!lm) {
      const t0 = performance.now();
      lm = selectLandmarks(graph, this.k);
      lm.preprocessMs = performance.now() - t0;
      this._landmarks.set(graph, lm);
    }
    return lm;
  }

  /** Preprocesamiento explícito (fase offline / arranque del servicio). */
  prepare(graph) {
    this.heuristicFor(graph);
    return this.landmarksFor(graph);
  }
}
