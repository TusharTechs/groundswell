// Greedy budget allocation: repeatedly add the candidate action that buys the
// most expected adopters per unit of cost, until the budget runs out or nothing
// helps. Uses the deterministic expected-value model, so it is fast and stable.

import { simulate } from "./model";
import type { Action, Grid, Params } from "./types";

export interface GreedyStep {
  actionId: string;
  adopters: number;
  gainPerCost: number;
}

export function greedyPlan(grid: Grid, candidates: Action[], budget: number, params: Params, maxActions = 12) {
  const base = { ...params, runs: 0, frameDays: [] };
  const chosen: Action[] = [];
  const steps: GreedyStep[] = [];
  let spent = 0;
  let current = simulate(grid, [], base).adopters.mean;
  const pool = [...candidates];
  while (chosen.length < maxActions) {
    let best: { i: number; adopters: number; ratio: number } | null = null;
    pool.forEach((a, i) => {
      if (spent + a.cost > budget) return;
      const adopters = simulate(grid, [...chosen, a], base).adopters.mean;
      const ratio = (adopters - current) / Math.max(a.cost, 1);
      if (ratio > 0 && (!best || ratio > best.ratio)) best = { i, adopters, ratio };
    });
    if (!best) break;
    const pick: { i: number; adopters: number; ratio: number } = best;
    const [a] = pool.splice(pick.i, 1);
    chosen.push(a);
    spent += a.cost;
    current = pick.adopters;
    steps.push({ actionId: a.id, adopters: pick.adopters, gainPerCost: pick.ratio });
  }
  return { actions: chosen, steps, cost: spent, adopters: current };
}
