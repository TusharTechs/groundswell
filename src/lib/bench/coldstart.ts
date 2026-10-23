// Cold-start geography test: can we find where a new launch's audience lives
// from its comparables alone, before it has any data of its own?
//
// For an established entity T in a city, the truth is T's own Qloo heatmap.
// Each method predicts a score per cell without seeing T's heatmap; we compare
// the cells it ranks highest with the cells where T's audience really is.

import { mulberry32 } from "../atlas/build";

export interface MethodScores {
  /** Share of the truth's top cells that the method also ranks top (top 10% of cells). */
  overlap: number;
  /** Audience held by the method's top cells ÷ audience held by the truth's top cells (1 = perfect). */
  capture: number;
  /** Spearman rank correlation between the method's scores and the true audience, over all cells. */
  spearman: number;
}

function topSet(scores: ArrayLike<number>, k: number, tieBreak: ArrayLike<number>): Set<number> {
  const idx = Array.from({ length: scores.length }, (_, i) => i);
  idx.sort((a, b) => scores[b] - scores[a] || tieBreak[b] - tieBreak[a]);
  return new Set(idx.slice(0, k));
}

function ranks(v: ArrayLike<number>): Float64Array {
  const idx = Array.from({ length: v.length }, (_, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    const avg = (i + j) / 2;
    for (let t = i; t <= j; t++) r[idx[t]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = ra.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

/** Score a method's per-cell prediction against the true per-cell audience. `tieBreak` orders equal scores (activity). */
export function scoreMethod(pred: ArrayLike<number>, truth: ArrayLike<number>, tieBreak: ArrayLike<number>, share = 0.1): MethodScores {
  const k = Math.max(1, Math.round(truth.length * share));
  const t = topSet(truth, k, tieBreak);
  const p = topSet(pred, k, tieBreak);
  let hit = 0;
  let got = 0;
  let best = 0;
  // Capture weighs cells by how much audience they hold; index truths can be negative (no signal), which counts as none.
  for (const i of p) {
    if (t.has(i)) hit++;
    got += Math.max(0, truth[i]);
  }
  for (const i of t) best += Math.max(0, truth[i]);
  return { overlap: hit / k, capture: best ? got / best : 0, spearman: spearman(pred, truth) };
}

/** Mean and 95% bootstrap interval of a list of values. */
export function bootstrap(values: number[], iters = 4000, seed = 5): { mean: number; lo: number; hi: number } {
  const n = values.length;
  if (!n) return { mean: 0, lo: 0, hi: 0 };
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let it = 0; it < iters; it++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(rand() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return { mean, lo: means[Math.floor(iters * 0.025)], hi: means[Math.floor(iters * 0.975)] };
}
