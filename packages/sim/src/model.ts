// A spatial, stochastic Bass diffusion on a city grid.
//
// Each cell holds a natural audience: the residents who could ever adopt the
// launch, set by the cell's population and how well the launch fits its taste.
// Every day, each potential adopter who hasn't adopted yet does so with
// probability 1 − exp(−h), where the hazard h is
//
//   h = baseRate + Σ actions' awareness in this cell today + wom × exposure^k
//
// and exposure is the share of the natural audience in the cell's social
// neighbourhood that is currently talking about it (recent adopters, fading
// with a half-life of about a week): the cell itself, its adjacent cells and its long taste
// ties (Bass 1969's imitation term, made spatial in the spirit of Hägerstrand's
// neighbourhood effect), raised to a power above 1 for complex contagion
// (Centola & Macy 2007): people adopt culture when several around them have.
// Adoption counts are drawn from binomials, and many seeded runs give a
// central estimate with a 10th–90th percentile band.

import { binomial, rng } from "./rng";
import type { Action, Grid, Params, SimResult } from "./types";

interface Prepared {
  n: number;
  audience: Float64Array;
  /** Denominator of each cell's exposure: weighted natural audience of its neighbourhood. */
  denom: Float64Array;
  geoInv: Float64Array;
  tieSum: Float64Array;
}

export function naturalAudience(grid: Grid, params: Pick<Params, "population" | "audienceShare" | "fitExponent">): Float64Array {
  const n = grid.mass.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, grid.mass[i]);
  const out = new Float64Array(n);
  if (total <= 0) return out;
  for (let i = 0; i < n; i++) {
    const residents = (params.population * Math.max(0, grid.mass[i])) / total;
    const fit = Math.max(0, Math.min(1, grid.fit[i]));
    const potential = grid.potential ? Math.max(0, Math.min(1, grid.potential[i])) : 1;
    out[i] = Math.round(residents * params.audienceShare * fit ** params.fitExponent * potential);
  }
  return out;
}

function prepare(grid: Grid, params: Params): Prepared {
  const n = grid.mass.length;
  const audience = naturalAudience(grid, params);
  const geoInv = new Float64Array(n);
  const tieSum = new Float64Array(n);
  const denom = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    geoInv[i] = grid.geo[i]?.length ? 1 / grid.geo[i].length : 0;
    let ts = 0;
    for (const [, w] of grid.ties[i] ?? []) ts += w;
    tieSum[i] = ts;
  }
  for (let i = 0; i < n; i++) denom[i] = neighbourhood(grid, params, audience, i, geoInv, tieSum);
  return { n, audience, denom, geoInv, tieSum };
}

function neighbourhood(grid: Grid, p: Params, v: ArrayLike<number>, i: number, geoInv: Float64Array, tieSum: Float64Array) {
  let geo = 0;
  for (const j of grid.geo[i] ?? []) geo += v[j];
  let tie = 0;
  if (tieSum[i] > 0) for (const [j, w] of grid.ties[i]) tie += w * v[j];
  return p.selfWeight * v[i] + p.geoWeight * geo * geoInv[i] + (tieSum[i] > 0 ? (p.tieWeight * tie) / tieSum[i] : 0);
}

/** Today's awareness rate from each action in each cell, accumulated into `total` and per action into `byAction`. */
function awareness(actions: Action[], day: number, n: number, total: Float64Array, byAction: Float64Array[]) {
  total.fill(0);
  actions.forEach((a, k) => {
    const mine = byAction[k];
    mine.fill(0);
    for (const e of a.effects) {
      if (day < e.from || day > e.to) continue;
      if (e.kind === "local") {
        for (const c of e.cells) if (c.index >= 0 && c.index < n) mine[c.index] += e.rate * c.weight;
      } else {
        for (let i = 0; i < n; i++) mine[i] += e.rate * e.weights[i];
      }
    }
    for (let i = 0; i < n; i++) total[i] += mine[i];
  });
}

function percentile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function simulate(grid: Grid, actions: Action[], params: Params): SimResult {
  const prep = prepare(grid, params);
  const { n, audience, denom } = prep;
  const days = Math.max(1, Math.round(params.days));
  const expected = params.runs <= 0;
  const runs = expected ? 1 : params.runs;
  const frameDays = (params.frameDays ?? []).filter((d) => d >= 0 && d < days);

  const totals: number[][] = Array.from({ length: days }, () => []);
  const finalCells = new Float64Array(n);
  const frames = frameDays.map((day) => ({ day, cells: new Float64Array(n) }));
  const credit = new Float64Array(actions.length);
  let wordOfMouth = 0;
  let organic = 0;

  const ext = new Float64Array(n);
  const extBy = actions.map(() => new Float64Array(n));
  const extByDay: { total: Float64Array; by: Float64Array[] }[] = [];
  for (let d = 0; d < days; d++) {
    awareness(actions, d, n, ext, extBy);
    extByDay.push({ total: Float64Array.from(ext), by: extBy.map((a) => Float64Array.from(a)) });
  }

  const x = new Float64Array(n);
  const buzz = new Float64Array(n);
  const add = new Float64Array(n);
  const fade = Math.pow(0.5, 1 / Math.max(0.5, params.buzzHalfLife));
  for (let r = 0; r < runs; r++) {
    const rand = rng(params.seed * 7919 + r * 104729);
    x.fill(0);
    buzz.fill(0);
    for (let d = 0; d < days; d++) {
      const { total, by } = extByDay[d];
      let cum = 0;
      for (let i = 0; i < n; i++) {
        const left = audience[i] - x[i];
        if (left <= 0 || denom[i] <= 0) {
          add[i] = 0;
          continue;
        }
        const exposure = neighbourhood(grid, params, buzz, i, prep.geoInv, prep.tieSum) / denom[i];
        const fromWom = params.wom * Math.pow(exposure, params.womExponent);
        const h = params.baseRate + total[i] + fromWom;
        const p = 1 - Math.exp(-h);
        const k = expected ? left * p : binomial(rand, left, p);
        add[i] = k;
        if (k > 0) {
          // Credit today's adopters in proportion to each source's share of the hazard.
          const share = k / h / runs;
          organic += params.baseRate * share;
          wordOfMouth += fromWom * share;
          for (let a = 0; a < actions.length; a++) if (by[a][i] > 0) credit[a] += by[a][i] * share;
        }
      }
      for (let i = 0; i < n; i++) {
        x[i] += add[i];
        buzz[i] = buzz[i] * fade + add[i];
        cum += x[i];
      }
      totals[d].push(cum);
      for (const f of frames) if (f.day === d) for (let i = 0; i < n; i++) f.cells[i] += x[i] / runs;
    }
    for (let i = 0; i < n; i++) finalCells[i] += x[i] / runs;
  }

  let natural = 0;
  for (let i = 0; i < n; i++) natural += audience[i];
  const curve = { mean: [] as number[], p10: [] as number[], p90: [] as number[] };
  for (let d = 0; d < days; d++) {
    const s = totals[d].sort((a, b) => a - b);
    curve.mean.push(s.reduce((a, b) => a + b, 0) / s.length);
    curve.p10.push(percentile(s, 0.1));
    curve.p90.push(percentile(s, 0.9));
  }
  const last = days - 1;
  const adopters = { mean: curve.mean[last], p10: curve.p10[last], p90: curve.p90[last] };
  const share = (v: number) => (natural > 0 ? v / natural : 0);
  let cellsReached = 0;
  for (let i = 0; i < n; i++) if (audience[i] > 0 && finalCells[i] / audience[i] >= 0.1) cellsReached++;

  return {
    days,
    naturalAudience: natural,
    curve,
    adopters,
    reach: { mean: share(adopters.mean), p10: share(adopters.p10), p90: share(adopters.p90) },
    byCell: finalCells,
    audienceByCell: audience,
    frames,
    attribution: {
      actions: Object.fromEntries(actions.map((a, k) => [a.id, credit[k]])),
      wordOfMouth,
      organic,
    },
    cellsReached,
    cost: actions.reduce((s, a) => s + a.cost, 0),
  };
}
