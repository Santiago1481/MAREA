/**
 * Grafo vial no dirigido y ponderado.
 * Cada arista guarda su costo base (tiempo a flujo libre, en segundos) y un
 * factor de congestión >= 1 que modifica TrafficService. El costo efectivo es
 * baseCost * factor, por lo que nunca es menor que el costo a flujo libre:
 * esa invariante mantiene admisibles las heurísticas precalculadas (A*, ALT).
 */
export class Graph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.adj = [];
    this.meta = {};
  }

  get size() {
    return this.nodes.length;
  }

  addNode(x, y, data = {}) {
    const id = this.nodes.length;
    this.nodes.push({ id, x, y, ...data });
    this.adj.push([]);
    return id;
  }

  addEdge(u, v, { length, speedKmh, name = '', kind = 'street', line = '', pos = 0 }) {
    const id = this.edges.length;
    const baseCost = length / (speedKmh / 3.6);
    this.edges.push({ id, u, v, length, speedKmh, name, kind, line, pos, baseCost, factor: 1 });
    this.adj[u].push(id);
    this.adj[v].push(id);
    return id;
  }

  other(edgeId, from) {
    const e = this.edges[edgeId];
    return e.u === from ? e.v : e.u;
  }

  cost(edgeId) {
    const e = this.edges[edgeId];
    return e.baseCost * e.factor;
  }

  pathCost(edgeIds) {
    let total = 0;
    for (const id of edgeIds) total += this.cost(id);
    return total;
  }

  pathLength(edgeIds) {
    let total = 0;
    for (const id of edgeIds) total += this.edges[id].length;
    return total;
  }
}
