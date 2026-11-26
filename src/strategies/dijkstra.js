import { RoutingStrategy, buildResult, notFound } from './base.js';
import { MinHeap } from '../core/heap.js';

/** Dijkstra con montículo binario y terminación temprana: O((V+E) log V). */
export class DijkstraStrategy extends RoutingStrategy {
  get name() {
    return 'Dijkstra';
  }

  findPath(graph, source, target, opts = {}) {
    const n = graph.size;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const trace = opts.trace ? [] : undefined;
    const heap = new MinHeap();
    dist[source] = 0;
    heap.push(0, source);
    let expanded = 0;

    while (heap.size) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      expanded++;
      if (trace) trace.push(u);
      if (u === target) return buildResult(graph, this.name, source, target, prevEdge, expanded, trace);
      const du = dist[u];
      for (const eid of graph.adj[u]) {
        const v = graph.other(eid, u);
        if (done[v]) continue;
        const nd = du + graph.cost(eid);
        if (nd < dist[v]) {
          dist[v] = nd;
          prevEdge[v] = eid;
          heap.push(nd, v);
        }
      }
    }
    return notFound(this.name, expanded, trace);
  }
}

/**
 * Árbol completo de caminos mínimos (sin destino). Se usa para precalcular
 * landmarks de ALT; por defecto sobre costos a flujo libre (baseCost).
 */
export function shortestPathTree(graph, source, { useBaseCost = true } = {}) {
  const dist = new Float64Array(graph.size).fill(Infinity);
  const heap = new MinHeap();
  dist[source] = 0;
  heap.push(0, source);
  while (heap.size) {
    const u = heap.pop();
    const du = heap.lastKey;
    if (du > dist[u]) continue;
    for (const eid of graph.adj[u]) {
      const v = graph.other(eid, u);
      const w = useBaseCost ? graph.edges[eid].baseCost : graph.cost(eid);
      const nd = du + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push(nd, v);
      }
    }
  }
  return dist;
}
