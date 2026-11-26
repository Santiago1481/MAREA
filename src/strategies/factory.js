import { LegacyDijkstraStrategy } from './legacy.js';
import { DijkstraStrategy } from './dijkstra.js';
import { AStarStrategy } from './astar.js';
import { ALTStrategy } from './alt.js';
import { BidirectionalDijkstraStrategy } from './bidirectional.js';
import { AdaptiveStrategy } from './adaptive.js';

/**
 * Factory + registro de estrategias. Cada estrategia se instancia una sola vez
 * (las que precalculan estado, como ALT, lo comparten). Agregar un algoritmo
 * nuevo = registrar una clave, sin tocar Router, caché ni interfaz (OCP).
 */
export class StrategyFactory {
  constructor({ landmarks = 8, adaptiveThreshold = 30 } = {}) {
    this.instances = new Map();
    this.registry = new Map([
      ['legacy', () => new LegacyDijkstraStrategy()],
      ['dijkstra', () => new DijkstraStrategy()],
      ['bidirectional', () => new BidirectionalDijkstraStrategy()],
      ['astar', () => new AStarStrategy()],
      ['alt', () => new ALTStrategy(landmarks)],
      [
        'adaptive',
        () =>
          new AdaptiveStrategy({
            short: this.create('astar'),
            long: this.create('alt'),
            thresholdCells: adaptiveThreshold,
          }),
      ],
    ]);
  }

  get keys() {
    return [...this.registry.keys()];
  }

  register(key, builder) {
    this.registry.set(key, builder);
    this.instances.delete(key);
  }

  create(key) {
    if (!this.registry.has(key)) throw new Error(`Estrategia desconocida: ${key}`);
    if (!this.instances.has(key)) this.instances.set(key, this.registry.get(key)());
    return this.instances.get(key);
  }
}

export const STRATEGY_LABELS = {
  legacy: 'Legacy (AS-IS)',
  dijkstra: 'Dijkstra + heap',
  bidirectional: 'Dijkstra bidireccional',
  astar: 'A* (Manhattan)',
  alt: 'ALT (landmarks)',
  adaptive: 'Adaptativa',
};
