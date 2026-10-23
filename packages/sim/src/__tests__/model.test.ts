import { describe, expect, it } from "vitest";
import { binomial, rng } from "../rng";
import { greedyPlan } from "../optimize";
import { naturalAudience, simulate } from "../model";
import { DEFAULT_PARAMS, type Action, type Grid, type Params } from "../types";

/** A 10 × 10 grid of equal cells; fit falls off from the left edge to the right. */
function lineGrid(size = 10): Grid {
  const n = size * size;
  const geo: number[][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const nb: number[] = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) nb.push(rr * size + cc);
      }
      geo.push(nb);
    }
  return {
    mass: new Array(n).fill(1),
    fit: Array.from({ length: n }, (_, i) => 1 - (i % size) / size),
    geo,
    ties: Array.from({ length: n }, () => []),
  };
}

const P: Params = { ...DEFAULT_PARAMS, days: 30, population: 50_000, runs: 24, seed: 3 };
const local = (id: string, index: number, rate = 0.05, cost = 100): Action => ({
  id,
  label: id,
  cost,
  effects: [{ kind: "local", cells: [{ index, weight: 1 }], rate, from: 0, to: 29 }],
});

describe("binomial", () => {
  it("has the right mean across regimes", () => {
    const r = rng(1);
    for (const [n, p] of [[20, 0.3], [500, 0.01], [5000, 0.2]] as const) {
      let s = 0;
      for (let i = 0; i < 4000; i++) s += binomial(r, n, p);
      expect(s / 4000).toBeGreaterThan(n * p * 0.95);
      expect(s / 4000).toBeLessThan(n * p * 1.05);
    }
  });
  it("stays within 0..n", () => {
    const r = rng(2);
    for (let i = 0; i < 1000; i++) {
      const k = binomial(r, 50, 0.97);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(50);
    }
  });
});

describe("simulate", () => {
  const grid = lineGrid();

  it("produces no adopters with no promotion and no spontaneous discovery", () => {
    const res = simulate(grid, [], { ...P, baseRate: 0 });
    expect(res.adopters.mean).toBe(0);
  });

  it("reproduces exactly with the same seed", () => {
    const a = simulate(grid, [local("v", 0)], P);
    const b = simulate(grid, [local("v", 0)], P);
    expect(a.curve.mean).toEqual(b.curve.mean);
  });

  it("never exceeds the natural audience, and the curve only rises", () => {
    const res = simulate(grid, [local("v", 0, 0.5)], { ...P, wom: 2 });
    const audience = naturalAudience(grid, P);
    res.byCell.forEach((x, i) => expect(x).toBeLessThanOrEqual(audience[i] + 1e-9));
    for (let d = 1; d < res.curve.mean.length; d++) expect(res.curve.mean[d]).toBeGreaterThanOrEqual(res.curve.mean[d - 1]);
    expect(res.reach.mean).toBeLessThanOrEqual(1);
  });

  it("concentrates a local action's adopters near where it runs", () => {
    const res = simulate(grid, [local("v", 0)], { ...P, baseRate: 0 });
    const near = res.byCell[0] + res.byCell[1] + res.byCell[10];
    const far = res.byCell[88] + res.byCell[89] + res.byCell[99];
    expect(near).toBeGreaterThan(far);
  });

  it("matches the expected-value model on average", () => {
    const mc = simulate(grid, [local("v", 0)], { ...P, runs: 64 });
    const ev = simulate(grid, [local("v", 0)], { ...P, runs: 0 });
    expect(Math.abs(mc.adopters.mean - ev.adopters.mean) / ev.adopters.mean).toBeLessThan(0.1);
    expect(mc.adopters.p10).toBeLessThanOrEqual(mc.adopters.mean);
    expect(mc.adopters.p90).toBeGreaterThanOrEqual(mc.adopters.mean);
  });

  it("credits every adopter to an action, word of mouth or organic discovery", () => {
    const res = simulate(grid, [local("a", 0), local("b", 55)], { ...P, runs: 0 });
    const credited = Object.values(res.attribution.actions).reduce((s, v) => s + v, 0) + res.attribution.wordOfMouth + res.attribution.organic;
    // Credit splits the hazard, not the exact probability, so it is close but not identical.
    expect(Math.abs(credited - res.adopters.mean) / res.adopters.mean).toBeLessThan(0.15);
  });

  it("reaches more with better-fitting cells", () => {
    const good = simulate(grid, [local("v", 0)], { ...P, runs: 0 });
    const poor = simulate(grid, [local("v", 9)], { ...P, runs: 0 });
    expect(good.adopters.mean).toBeGreaterThan(poor.adopters.mean);
  });

  it("snapshots frames on the requested days", () => {
    const res = simulate(grid, [local("v", 0)], { ...P, frameDays: [0, 14, 29] });
    expect(res.frames.map((f) => f.day)).toEqual([0, 14, 29]);
    const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0);
    expect(sum(res.frames[2].cells)).toBeCloseTo(res.adopters.mean, 0);
  });
});

describe("greedyPlan", () => {
  it("stays within budget and prefers the better-fitting cell", () => {
    const grid = lineGrid();
    const candidates = [local("poor", 9, 0.05, 100), local("good", 0, 0.05, 100), local("mid", 5, 0.05, 100)];
    const plan = greedyPlan(grid, candidates, 200, { ...P, runs: 0 });
    expect(plan.cost).toBeLessThanOrEqual(200);
    expect(plan.actions[0].id).toBe("good");
  });
});
