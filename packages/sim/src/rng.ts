// Seeded randomness, so a simulation with the same seed reproduces exactly.

export type Rng = () => number;

/** mulberry32: small, fast, good enough for Monte Carlo. Returns [0, 1). */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function poisson(r: Rng, mean: number): number {
  // Knuth's method; fine for the small means it is used for.
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > l);
  return k - 1;
}

/** Draw from Binomial(n, p): exact for small n, Poisson or normal approximations otherwise. */
export function binomial(r: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 40) {
    let k = 0;
    for (let i = 0; i < n; i++) if (r() < p) k++;
    return k;
  }
  const mean = n * p;
  if (mean < 12) return Math.min(n, poisson(r, mean));
  const sd = Math.sqrt(mean * (1 - p));
  return Math.max(0, Math.min(n, Math.round(mean + sd * normal(r))));
}
