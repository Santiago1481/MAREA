const now = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * Patrón Proxy (de caché) + Observer.
 * CachedRouter expone la misma interfaz route() que Router, pero responde
 * desde una caché LRU las rutas ya calculadas. Se suscribe a TrafficService
 * para invalidar SOLO lo necesario:
 *  - Si una arista se ENCARECE, solo pueden dejar de ser óptimas las rutas
 *    que la contienen (las demás no cambian de costo y ninguna alternativa
 *    se abarató) → invalidación selectiva por índice arista→rutas.
 *  - Si una arista se ABARATA, cualquier ruta podría mejorar pasando por ella
 *    → vaciado completo (evento poco frecuente: fin de un incidente).
 */
export class CachedRouter {
  /**
   * @param {object} router  Objeto con route(s,t,opts) (Router real).
   * @param {object} [o]
   * @param {number} [o.capacity]   Máximo de rutas en memoria (LRU).
   * @param {(a:number,b:number)=>number} [o.lowerBound]  Cota inferior admisible
   *        de la distancia (p. ej. heurística ALT) para conservar rutas cuando
   *        el tráfico mejora. Sin ella, una mejora vacía la caché.
   */
  constructor(router, { capacity = 1000, lowerBound = null } = {}) {
    this.router = router;
    this.capacity = capacity;
    this.lowerBound = lowerBound;
    this.lru = new Map(); // key -> result (orden de inserción = recencia)
    this.edgeIndex = new Map(); // edgeId -> Set<key>
    this.stats = { hits: 0, misses: 0, invalidated: 0, flushes: 0, evictions: 0, boundChecks: 0 };
  }

  get graph() {
    return this.router.graph;
  }

  key(s, t) {
    return `${s}>${t}`;
  }

  route(source, target, opts = {}) {
    const key = this.key(source, target);
    if (!opts.bypassCache && this.lru.has(key)) {
      const t0 = now();
      const hit = this.lru.get(key);
      this.lru.delete(key);
      this.lru.set(key, hit);
      this.stats.hits++;
      return { ...hit, trace: undefined, cacheHit: true, expanded: 0, ms: now() - t0 };
    }
    const res = this.router.route(source, target, opts);
    this.stats.misses++;
    if (res.found) this._store(key, res);
    return { ...res, cacheHit: false };
  }

  _store(key, res) {
    const { trace, ...stored } = res; // no se guarda la traza de visualización
    this.lru.set(key, stored);
    for (const e of stored.edges) {
      if (!this.edgeIndex.has(e)) this.edgeIndex.set(e, new Set());
      this.edgeIndex.get(e).add(key);
    }
    while (this.lru.size > this.capacity) {
      const oldest = this.lru.keys().next().value;
      this._remove(oldest);
      this.stats.evictions++;
    }
  }

  _remove(key) {
    const r = this.lru.get(key);
    if (!r) return false;
    this.lru.delete(key);
    for (const e of r.edges) {
      const set = this.edgeIndex.get(e);
      if (set) {
        set.delete(key);
        if (!set.size) this.edgeIndex.delete(e);
      }
    }
    return true;
  }

  clear() {
    this.lru.clear();
    this.edgeIndex.clear();
  }

  /** Observer de TrafficService. */
  onTrafficEvent(evt) {
    const worse = evt.changes.filter((c) => c.next > c.prev);
    const better = evt.changes.filter((c) => c.next < c.prev);

    // 1) Aristas encarecidas: invalidación selectiva exacta vía índice.
    for (const { edgeId } of worse) {
      const keys = this.edgeIndex.get(edgeId);
      if (!keys) continue;
      for (const k of [...keys]) if (this._remove(k)) this.stats.invalidated++;
    }
    if (!better.length) return;

    // 2) Aristas abaratadas sin cota disponible: vaciado completo (conservador).
    if (!this.lowerBound) {
      this.stats.invalidated += this.lru.size;
      this.stats.flushes++;
      this.clear();
      return;
    }

    // 3) Con cota inferior admisible LB (heurística ALT): una ruta s→t de costo C
    //    solo puede mejorar usando una arista abaratada e=(u,v) de nuevo costo w,
    //    y cualquier camino así cuesta >= min(LB(s,u)+w+LB(v,t), LB(s,v)+w+LB(u,t)).
    //    Si esa cota >= C, la ruta en caché sigue siendo óptima y se conserva.
    const g = this.graph;
    const lb = this.lowerBound;
    const changed = better.map((c) => ({ e: g.edges[c.edgeId], w: g.cost(c.edgeId) }));
    for (const [key, r] of [...this.lru]) {
      const s = r.source;
      const t = r.target;
      for (const { e, w } of changed) {
        const via = Math.min(lb(s, e.u) + w + lb(e.v, t), lb(s, e.v) + w + lb(e.u, t));
        if (via < r.cost - 1e-9) {
          this._remove(key);
          this.stats.invalidated++;
          break;
        }
      }
      this.stats.boundChecks++;
    }
  }

  get hitRatio() {
    const total = this.stats.hits + this.stats.misses;
    return total ? this.stats.hits / total : 0;
  }
}
