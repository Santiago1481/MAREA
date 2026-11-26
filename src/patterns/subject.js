/**
 * Patrón Observer — Sujeto genérico. Los observadores pueden ser funciones
 * o objetos con un método manejador (p. ej. onTrafficEvent).
 */
export class Subject {
  constructor(method) {
    this.method = method;
    this.observers = new Set();
  }

  subscribe(observer) {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  notify(event) {
    for (const o of this.observers) {
      if (typeof o === 'function') o(event);
      else o[this.method](event);
    }
  }
}
