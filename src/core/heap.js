/**
 * Montículo binario mínimo con claves numéricas (O(log n) push/pop).
 * Se usa con "borrado perezoso": las entradas obsoletas se descartan al salir.
 */
export class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }

  get size() {
    return this.keys.length;
  }

  peekKey() {
    return this.keys.length ? this.keys[0] : Infinity;
  }

  push(key, val) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  /** Extrae el valor de menor clave; deja la clave en this.lastKey. */
  pop() {
    const k = this.keys;
    const v = this.vals;
    const topKey = k[0];
    const topVal = v[0];
    const lastKey = k.pop();
    const lastVal = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastKey) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastKey;
      v[i] = lastVal;
    }
    this.lastKey = topKey;
    return topVal;
  }
}
