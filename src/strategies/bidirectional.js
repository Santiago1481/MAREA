import { RoutingStrategy, notFound } from './base.js';
import { MinHeap } from '../core/heap.js';

/**
 * Dijkstra bidireccional: dos frentes (desde el origen y desde el destino)
 * que se encuentran a mitad de camino. Criterio de parada:
 * min(F) + min(B) >= μ, con μ = mejor costo de conexión hallado.
 */
export class BidirectionalDijkstraStrategy extends RoutingStrategy {
  get name() {
    return 'Dijkstra bidireccional';
  }

  findPath(graph, source, target, opts = {}) {
    const trace = opts.trace ? [] : undefined;
    if (source === target) {
      return { strategy: this.name, found: true, path: [source], edges: [], cost: 0, distance: 0, expanded: 0, trace };
    }
    const n = graph.size;
    const dist = [new Float64Array(n).fill(Infinity), new Float64Array(n).fill(Infinity)];
    const prev = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
    const done = [new Uint8Array(n), new Uint8Array(n)];
    const heap = [new MinHeap(), new MinHeap()];
    dist[0][source] = 0;
    dist[1][target] = 0;
    heap[0].push(0, source);
    heap[1].push(0, target);
    let mu = Infinity;
    let meetA = -1; // nodo en el árbol hacia adelante
    let meetB = -1; // nodo en el árbol hacia atrás
    let meetEdge = -1;
    let expanded = 0;

    while (heap[0].size && heap[1].size) {
      if (heap[0].peekKey() + heap[1].peekKey() >= mu) break;
      const side = heap[0].peekKey() <= heap[1].peekKey() ? 0 : 1;
      const other = 1 - side;
      const u = heap[side].pop();
      if (done[side][u]) continue;
      done[side][u] = 1;
      expanded++;
      if (trace) trace.push(u);
      const du = dist[side][u];
      for (const eid of graph.adj[u]) {
        const v = graph.other(eid, u);
        const w = graph.cost(eid);
        const nd = du + w;
        if (!done[side][v] && nd < dist[side][v]) {
          dist[side][v] = nd;
          prev[side][v] = eid;
          heap[side].push(nd, v);
        }
        const dv = dist[other][v];
        if (dv < Infinity && du + w + dv < mu) {
          mu = du + w + dv;
          meetEdge = eid;
          if (side === 0) {
            meetA = u;
            meetB = v;
          } else {
            meetA = v;
            meetB = u;
          }
        }
      }
    }
    if (!Number.isFinite(mu)) return notFound(this.name, expanded, trace);

    // origen → meetA (árbol adelante), arista de encuentro, meetB → destino (árbol atrás)
    const front = [];
    const frontEdges = [];
    let v = meetA;
    front.push(v);
    while (v !== source) {
      const e = prev[0][v];
      frontEdges.push(e);
      v = graph.other(e, v);
      front.push(v);
    }
    front.reverse();
    frontEdges.reverse();
    const path = [...front, meetB];
    const edges = [...frontEdges, meetEdge];
    v = meetB;
    while (v !== target) {
      const e = prev[1][v];
      edges.push(e);
      v = graph.other(e, v);
      path.push(v);
    }
    return {
      strategy: this.name,
      found: true,
      path,
      edges,
      cost: graph.pathCost(edges),
      distance: graph.pathLength(edges),
      expanded,
      trace,
    };
  }
}
