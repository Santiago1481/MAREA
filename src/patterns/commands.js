/**
 * Patrón Command. Cada acción de navegación es un objeto con execute()
 * (y undo() cuando es reversible). El CommandBus (Invoker) mantiene la
 * bitácora para auditoría/reproducción de escenarios y la pila de deshacer.
 */
export class CommandBus {
  constructor() {
    this.history = [];
    this.log = [];
  }

  execute(cmd) {
    const result = cmd.execute();
    this.log.push({ command: cmd.label, at: Date.now() });
    if (typeof cmd.undo === 'function') this.history.push(cmd);
    return result;
  }

  undo() {
    const cmd = this.history.pop();
    if (!cmd) return null;
    cmd.undo();
    this.log.push({ command: `Deshacer: ${cmd.label}`, at: Date.now() });
    return cmd;
  }

  get canUndo() {
    return this.history.length > 0;
  }
}

/** Solicitar una ruta (no reversible; queda en la bitácora). */
export class RequestRouteCommand {
  constructor(router, source, target, opts = {}) {
    Object.assign(this, { router, source, target, opts });
    this.label = `Ruta ${source} → ${target}`;
  }

  execute() {
    return this.router.route(this.source, this.target, this.opts);
  }
}

/** Cambiar la estrategia de navegación activa (reversible). */
export class SetStrategyCommand {
  constructor(router, factory, key) {
    Object.assign(this, { router, factory, key });
    this.label = `Estrategia → ${key}`;
  }

  execute() {
    this.previous = this.router.strategy;
    this.router.setStrategy(this.factory.create(this.key));
    return this.router.strategy;
  }

  undo() {
    this.router.setStrategy(this.previous);
  }
}

/** Inyectar un incidente de tráfico (reversible: restaura los factores). */
export class TrafficIncidentCommand {
  constructor(traffic, edgeIds, factor, label = 'Incidente de tráfico') {
    Object.assign(this, { traffic, edgeIds, factor });
    this.label = `${label} ×${factor} (${edgeIds.length} tramos)`;
  }

  execute() {
    this.event = this.traffic.setCongestion(this.edgeIds, this.factor, this.label);
    return this.event;
  }

  undo() {
    this.traffic.restore(this.event.changes, `Fin: ${this.label}`);
  }
}
