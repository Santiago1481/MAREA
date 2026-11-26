import { Subject } from './subject.js';

/**
 * TrafficService — SUJETO del patrón Observer.
 * Recibe incidentes (congestión sobre un tramo de vía) y notifica a los
 * suscriptores: caché de rutas, sesiones de navegación activas, métricas.
 * Los factores siempre son >= 1 (la congestión nunca abarata una vía).
 */
export class TrafficService {
  constructor(graph) {
    this.graph = graph;
    this.subject = new Subject('onTrafficEvent');
    this.log = [];
  }

  subscribe(observer) {
    return this.subject.subscribe(observer);
  }

  /** Aplica factor de congestión a un conjunto de aristas. Devuelve el estado previo (para deshacer). */
  setCongestion(edgeIds, factor, label = 'Incidente') {
    if (factor < 1) throw new RangeError('El factor de congestión debe ser >= 1');
    const changes = [];
    for (const edgeId of edgeIds) {
      const e = this.graph.edges[edgeId];
      if (e.factor === factor) continue;
      changes.push({ edgeId, prev: e.factor, next: factor });
      e.factor = factor;
    }
    return this._emit(changes, label);
  }

  /** Restaura factores previos (fin del incidente o "deshacer"). */
  restore(changes, label = 'Restauración') {
    const back = [];
    for (const c of changes) {
      const e = this.graph.edges[c.edgeId];
      back.push({ edgeId: c.edgeId, prev: e.factor, next: c.prev });
      e.factor = c.prev;
    }
    return this._emit(back, label);
  }

  _emit(changes, label) {
    const evt = {
      type: 'traffic',
      label,
      changes,
      worsened: changes.some((c) => c.next > c.prev),
      improved: changes.some((c) => c.next < c.prev),
      at: Date.now(),
    };
    this.log.push(evt);
    if (changes.length) this.subject.notify(evt);
    return evt;
  }

  /** Tramo contiguo de `length` aristas sobre una vía (avenida por defecto). */
  pickSegment(rng, { length = 6, kind = 'avenue', aroundEdges = null } = {}) {
    const g = this.graph;
    let seed;
    if (aroundEdges && aroundEdges.length) {
      // tramo central de la ruta (evita incidentes pegados al origen/destino)
      const mid = aroundEdges.slice(Math.floor(aroundEdges.length * 0.3), Math.ceil(aroundEdges.length * 0.7));
      const candidates = (mid.length ? mid : aroundEdges).filter((id) => g.edges[id].kind !== 'bridge');
      seed = g.edges[rng.pick(candidates.length ? candidates : aroundEdges)];
    } else {
      const pool = g.edges.filter((e) => e.kind === kind);
      seed = rng.pick(pool);
    }
    const line = g.meta.lines.get(seed.line);
    const i = line.indexOf(seed.id);
    const start = Math.max(0, i - Math.floor(length / 2));
    return line.slice(start, start + length);
  }
}
