/**
 * Patrón Iterator — recorre una ruta como instrucciones giro a giro,
 * generadas de forma perezosa (solo se calculan las que se consumen).
 * Agrupa aristas consecutivas de la misma vía en una sola maniobra.
 */
export class RouteIterator {
  constructor(graph, route) {
    this.graph = graph;
    this.route = route;
  }

  *[Symbol.iterator]() {
    const { graph, route } = this;
    if (!route.found || route.edges.length === 0) return;
    const segs = [];
    for (let i = 0; i < route.edges.length; i++) {
      const e = graph.edges[route.edges[i]];
      const a = graph.nodes[route.path[i]];
      const b = graph.nodes[route.path[i + 1]];
      const dir = [b.x - a.x, b.y - a.y];
      const last = segs[segs.length - 1];
      if (last && last.name === e.name && last.dir[0] === dir[0] && last.dir[1] === dir[1]) {
        last.distance += e.length;
        last.duration += graph.cost(e.id);
      } else {
        segs.push({ name: e.name, dir, distance: e.length, duration: graph.cost(e.id), from: route.path[i] });
      }
    }
    let step = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      let type = 'start';
      if (i > 0) {
        const p = segs[i - 1].dir;
        const cross = p[0] * s.dir[1] - p[1] * s.dir[0]; // eje y hacia abajo: >0 = derecha
        type = cross > 0 ? 'right' : cross < 0 ? 'left' : 'continue';
      }
      const verb = {
        start: `Inicie hacia el ${heading(s.dir)} por`,
        right: 'Gire a la derecha en',
        left: 'Gire a la izquierda en',
        continue: 'Continúe por',
      }[type];
      yield {
        step: ++step,
        type,
        street: s.name,
        distance: s.distance,
        duration: s.duration,
        instruction: `${verb} ${s.name} durante ${fmtDistance(s.distance)}`,
      };
    }
    yield { step: ++step, type: 'arrive', street: '', distance: 0, duration: 0, instruction: 'Ha llegado a su destino' };
  }
}

function heading([dx, dy]) {
  if (dx > 0) return 'oriente';
  if (dx < 0) return 'occidente';
  return dy > 0 ? 'sur' : 'norte';
}

export function fmtDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m} min ${r} s` : `${r} s`;
}
