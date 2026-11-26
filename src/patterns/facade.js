import { generateCity } from '../core/city.js';
import { createRng } from '../core/rng.js';
import { StrategyFactory } from '../strategies/factory.js';
import { Router } from './router.js';
import { CachedRouter } from './cache.js';
import { TrafficService } from './traffic.js';
import { CommandBus, RequestRouteCommand, SetStrategyCommand, TrafficIncidentCommand } from './commands.js';
import { MetricsCollector, NavigationSession } from './observers.js';
import { RouteIterator } from './iterator.js';

/**
 * Patrón Facade — punto de entrada único de MAREA.
 * Ensambla el grafo, la fábrica de estrategias, el router (Strategy), la caché
 * (Proxy), el servicio de tráfico (Observer), la bitácora (Command) y el
 * generador de instrucciones (Iterator). La UI y el API solo conocen esta clase.
 */
export class NavigationSystem {
  constructor({ size = 100, seed = 42, cacheCapacity = 1000, landmarks = 8, strategy = 'adaptive', onReroute } = {}) {
    this.graph = generateCity({ size, seed });
    this.rng = createRng(seed + 1);
    this.factory = new StrategyFactory({ landmarks });
    this.router = new Router(this.graph, this.factory.create(strategy));
    this.strategyKey = strategy;
    // Proxy de caché con cotas ALT: conserva rutas que siguen siendo óptimas al terminar incidentes.
    const alt = this.factory.create('alt');
    this.cache = new CachedRouter(this.router, {
      capacity: cacheCapacity,
      lowerBound: (a, b) => alt.heuristicFor(this.graph)(a, b),
    });
    this.traffic = new TrafficService(this.graph);
    this.metrics = new MetricsCollector();
    // La sesión re-rutea a través del Proxy: la caché ya fue invalidada (se suscribe antes)
    // y la nueva ruta queda almacenada para los siguientes conductores.
    this.session = new NavigationSession(this.cache, (info) => onReroute?.(info));
    this.bus = new CommandBus();

    // Cableado de observadores
    this.router.events.subscribe(this.metrics);
    this.traffic.subscribe(this.cache);
    this.traffic.subscribe(this.session);
  }

  /** Fase de preparación (offline): precálculo de landmarks para ALT. */
  warmUp() {
    const alt = this.factory.create('alt');
    return alt.prepare(this.graph);
  }

  route(source, target, opts = {}) {
    const res = this.bus.execute(new RequestRouteCommand(this.cache, source, target, opts));
    this.session.follow(res);
    return res;
  }

  setStrategy(key) {
    this.bus.execute(new SetStrategyCommand(this.router, this.factory, key));
    this.strategyKey = key;
    this.cache.clear(); // una estrategia nueva no debe heredar respuestas de otra
  }

  /** Congestiona un tramo (por defecto, sobre la ruta activa para forzar re-ruteo). */
  injectIncident({ factor = 4, length = 6, onActiveRoute = true } = {}) {
    const around = onActiveRoute && this.session.route?.found ? this.session.route.edges : null;
    const edges = this.traffic.pickSegment(this.rng, { length, aroundEdges: around });
    return this.bus.execute(new TrafficIncidentCommand(this.traffic, edges, factor));
  }

  undo() {
    const cmd = this.bus.undo();
    if (cmd instanceof SetStrategyCommand) {
      this.strategyKey = this.factory.keys.find((k) => this.factory.create(k) === this.router.strategy) ?? this.strategyKey;
      this.cache.clear();
    }
    return cmd;
  }

  directions(route) {
    return [...new RouteIterator(this.graph, route)];
  }

  /** Compara todas las estrategias sobre el mismo par (sin caché). */
  compare(source, target, keys = ['dijkstra', 'bidirectional', 'astar', 'alt']) {
    return keys.map((k) => {
      const s = this.factory.create(k);
      const t0 = performance.now();
      const r = s.findPath(this.graph, source, target, { trace: true });
      r.ms = performance.now() - t0;
      r.key = k;
      return r;
    });
  }
}
