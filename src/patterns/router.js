import { Subject } from './subject.js';

const now = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * Router — CONTEXTO del patrón Strategy y SUJETO de eventos de ruteo.
 * Delega el cálculo en la estrategia activa, mide su latencia y publica
 * cada resultado a los observadores (p. ej. MetricsCollector).
 */
export class Router {
  constructor(graph, strategy) {
    this.graph = graph;
    this.strategy = strategy;
    this.events = new Subject('onRouteComputed');
  }

  setStrategy(strategy) {
    this.strategy = strategy;
  }

  route(source, target, opts = {}) {
    const t0 = now();
    const res = this.strategy.findPath(this.graph, source, target, opts);
    res.ms = now() - t0;
    res.source = source;
    res.target = target;
    this.events.notify(res);
    return res;
  }
}
