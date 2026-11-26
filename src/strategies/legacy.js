import { RoutingStrategy, buildResult, notFound } from './base.js';

/**
 * LÍNEA BASE DIAGNOSTICADA (arquitectura "AS-IS").
 * Dijkstra tal como suele aparecer en código heredado:
 *  - cola de prioridad como arreglo sin ordenar (búsqueda lineal del mínimo),
 *  - sin terminación temprana: calcula el árbol completo de caminos mínimos
 *    para cada consulta, aunque solo se necesite un destino.
 * Es correcto, pero su costo crece de forma superlineal con la ciudad.
 */
export class LegacyDijkstraStrategy extends RoutingStrategy {
  get name() {
    return 'Legacy (AS-IS)';
  }

  findPath(graph, source, target, opts = {}) {
    const n = graph.size;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const inOpen = new Uint8Array(n);
    const trace = opts.trace ? [] : undefined;
    const open = [source];
    inOpen[source] = 1;
    dist[source] = 0;
    let expanded = 0;

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const u = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done[u]) continue;
      done[u] = 1;
      expanded++;
      if (trace) trace.push(u);
      for (const eid of graph.adj[u]) {
        const v = graph.other(eid, u);
        if (done[v]) continue;
        const nd = dist[u] + graph.cost(eid);
        if (nd < dist[v]) {
          dist[v] = nd;
          prevEdge[v] = eid;
          if (!inOpen[v]) {
            inOpen[v] = 1;
            open.push(v);
          }
        }
      }
    }
    if (!Number.isFinite(dist[target])) return notFound(this.name, expanded, trace);
    return buildResult(graph, this.name, source, target, prevEdge, expanded, trace);
  }
}
