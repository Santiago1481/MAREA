import { RoutingStrategy, buildResult, notFound } from './base.js';
import { MinHeap } from '../core/heap.js';

/**
 * Heurística de Manhattan en tiempo: distancia en retícula / velocidad máxima.
 * Es admisible y consistente porque (1) todo movimiento es ortogonal de una
 * celda, (2) ninguna vía supera la velocidad máxima y (3) la congestión solo
 * aumenta los costos (factor >= 1).
 */
export function manhattanHeuristic(graph) {
  const k = graph.meta.cellMeters / (graph.meta.maxSpeedKmh / 3.6);
  const nodes = graph.nodes;
  return (v, t) => (Math.abs(nodes[v].x - nodes[t].x) + Math.abs(nodes[v].y - nodes[t].y)) * k;
}

/** A*: búsqueda informada f = g + h. Óptima con heurística consistente. */
export class AStarStrategy extends RoutingStrategy {
  constructor(heuristicFactory = manhattanHeuristic, label = 'A*') {
    super();
    this.heuristicFactory = heuristicFactory;
    this.label = label;
    this._cache = new WeakMap();
  }

  get name() {
    return this.label;
  }

  heuristicFor(graph) {
    let h = this._cache.get(graph);
    if (!h) {
      h = this.heuristicFactory(graph);
      this._cache.set(graph, h);
    }
    return h;
  }

  findPath(graph, source, target, opts = {}) {
    const h = this.heuristicFor(graph);
    const n = graph.size;
    const g = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const trace = opts.trace ? [] : undefined;
    const heap = new MinHeap();
    g[source] = 0;
    heap.push(h(source, target), source);
    let expanded = 0;

    while (heap.size) {
      const u = heap.pop();
      if (closed[u]) continue;
      closed[u] = 1;
      expanded++;
      if (trace) trace.push(u);
      if (u === target) return buildResult(graph, this.name, source, target, prevEdge, expanded, trace);
      const gu = g[u];
      for (const eid of graph.adj[u]) {
        const v = graph.other(eid, u);
        if (closed[v]) continue;
        const ng = gu + graph.cost(eid);
        if (ng < g[v]) {
          g[v] = ng;
          prevEdge[v] = eid;
          heap.push(ng + h(v, target), v);
        }
      }
    }
    return notFound(this.name, expanded, trace);
  }
}
