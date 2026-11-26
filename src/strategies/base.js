/**
 * Patrón Strategy — interfaz común de los algoritmos de navegación.
 * Toda estrategia recibe (grafo, origen, destino, opciones) y devuelve un
 * RouteResult homogéneo, de modo que el Router (contexto) puede
 * intercambiarlas en tiempo de ejecución sin conocer su implementación.
 *
 * @typedef {Object} RouteResult
 * @property {string}   strategy  Nombre de la estrategia que resolvió la ruta.
 * @property {boolean}  found
 * @property {number[]} path      Nodos desde el origen hasta el destino.
 * @property {number[]} edges     Aristas recorridas.
 * @property {number}   cost      Tiempo estimado de viaje (s).
 * @property {number}   distance  Longitud (m).
 * @property {number}   expanded  Nodos expandidos (proxy de trabajo/CPU).
 * @property {number[]} [trace]   Orden de expansión (solo si opts.trace).
 */
export class RoutingStrategy {
  get name() {
    throw new Error('RoutingStrategy.name no implementado');
  }

  // eslint-disable-next-line no-unused-vars
  findPath(graph, source, target, opts = {}) {
    throw new Error('RoutingStrategy.findPath no implementado');
  }
}

/** Reconstruye la ruta a partir de los punteros de predecesor. */
export function buildResult(graph, name, source, target, prevEdge, expanded, trace) {
  const edges = [];
  const path = [target];
  let v = target;
  while (v !== source) {
    const eid = prevEdge[v];
    if (eid < 0) return notFound(name, expanded, trace);
    edges.push(eid);
    v = graph.other(eid, v);
    path.push(v);
  }
  edges.reverse();
  path.reverse();
  return {
    strategy: name,
    found: true,
    path,
    edges,
    cost: graph.pathCost(edges),
    distance: graph.pathLength(edges),
    expanded,
    trace,
  };
}

export function notFound(name, expanded = 0, trace) {
  return { strategy: name, found: false, path: [], edges: [], cost: Infinity, distance: 0, expanded, trace };
}
