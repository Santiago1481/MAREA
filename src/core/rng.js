/** Generador pseudoaleatorio determinista (mulberry32) para experimentos reproducibles. */
export function createRng(seed = 42) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

/** Muestreador Zipf(s) sobre n elementos: modela "rutas calientes" (pocas rutas, mucha demanda). */
export function createZipf(n, s, rng) {
  const cdf = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / Math.pow(i + 1, s);
    cdf[i] = acc;
  }
  for (let i = 0; i < n; i++) cdf[i] /= acc;
  return () => {
    const r = rng();
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}
