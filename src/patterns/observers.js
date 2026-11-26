/** Observer de Router: acumula métricas de cada cálculo (latencia, expansión). */
export class MetricsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.samples = [];
    this.byStrategy = new Map();
  }

  onRouteComputed(res) {
    const s = { strategy: res.strategy, ms: res.ms, expanded: res.expanded, cost: res.cost };
    this.samples.push(s);
    if (!this.byStrategy.has(res.strategy)) this.byStrategy.set(res.strategy, []);
    this.byStrategy.get(res.strategy).push(s);
  }

  summary() {
    const out = {};
    for (const [k, arr] of this.byStrategy) {
      const ms = arr.map((x) => x.ms).sort((a, b) => a - b);
      out[k] = {
        n: arr.length,
        meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
        p95Ms: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))],
        meanExpanded: arr.reduce((a, b) => a + b.expanded, 0) / arr.length,
      };
    }
    return out;
  }
}

/**
 * Observer de TrafficService: sesión de navegación activa (el conductor).
 * Si un incidente afecta una arista de la ruta que se está siguiendo,
 * recalcula automáticamente desde el origen actual (re-ruteo reactivo).
 */
export class NavigationSession {
  constructor(router, onReroute = () => {}) {
    this.router = router;
    this.onReroute = onReroute;
    this.route = null;
  }

  follow(route) {
    this.route = route;
  }

  onTrafficEvent(evt) {
    if (!this.route || !this.route.found || !evt.worsened) return;
    const used = new Set(this.route.edges);
    const hit = evt.changes.filter((c) => used.has(c.edgeId));
    if (!hit.length) return;
    const before = this.route;
    const after = this.router.route(before.source, before.target, { trace: true });
    this.route = after;
    this.onReroute({ before, after, affectedEdges: hit.length, event: evt });
  }
}
