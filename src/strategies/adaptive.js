import { RoutingStrategy } from './base.js';

/**
 * Estrategia adaptativa (Strategy que compone Strategies).
 * Política: trayectos cortos → A* (sin costo de memoria extra);
 * trayectos largos → ALT (la cota de landmarks poda mucho más).
 * Así el sistema elige "cómo navegar" según el contexto de cada consulta.
 */
export class AdaptiveStrategy extends RoutingStrategy {
  constructor({ short, long, thresholdCells = 30 }) {
    super();
    this.short = short;
    this.long = long;
    this.thresholdCells = thresholdCells;
  }

  get name() {
    return 'Adaptativa';
  }

  choose(graph, source, target) {
    const a = graph.nodes[source];
    const b = graph.nodes[target];
    const cells = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    return cells < this.thresholdCells ? this.short : this.long;
  }

  findPath(graph, source, target, opts = {}) {
    const chosen = this.choose(graph, source, target);
    const res = chosen.findPath(graph, source, target, opts);
    return { ...res, strategy: `Adaptativa → ${chosen.name}`, delegate: chosen.name };
  }
}
