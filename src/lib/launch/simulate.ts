// Running plans through the simulator, and summarising results for agents and the UI.

import { DEFAULT_PARAMS, simulate, type Action, type Params, type SimResult } from "@groundswell/sim";
import type { CityAtlas } from "../atlas/types";
import { gridOf } from "./grid";

export { gridOf };

export function paramsFor(days: number, overrides: Partial<Params> = {}): Params {
  return { ...DEFAULT_PARAMS, days, ...overrides };
}

/** Frame days for animation: every other day plus launch day. */
export function frameDaysFor(days: number) {
  const out: number[] = [];
  for (let d = 0; d < days; d += 2) out.push(d);
  if (out[out.length - 1] !== days - 1) out.push(days - 1);
  return out;
}

export interface PlanMetrics {
  reach: { mean: number; p10: number; p90: number };
  adopters: { mean: number; p10: number; p90: number };
  naturalAudience: number;
  cost: number;
  /** Cost per percentage point of the natural audience reached. */
  costPerPoint: number | null;
  wordOfMouthShare: number;
  cellsReached: number;
  /** Cumulative adopters at the end of each week (and launch day). */
  weekly: number[];
  /** Share of each district's natural audience reached. */
  byDistrict: { district: number; name: string; reach: number; adopters: number }[];
  /** Adopters credited to each action, largest first. */
  topActions: { id: string; label: string; adopters: number; cost: number }[];
}

export function metricsOf(res: SimResult, atlas: CityAtlas, actions: Action[]): PlanMetrics {
  const credited = Object.values(res.attribution.actions).reduce((s, v) => s + v, 0) + res.attribution.wordOfMouth + res.attribution.organic;
  const byDistrict = atlas.districts.map((d) => {
    let a = 0;
    let aud = 0;
    atlas.cells.forEach((c, i) => {
      if (c.district === d.id) {
        a += res.byCell[i];
        aud += res.audienceByCell[i];
      }
    });
    return { district: d.id, name: d.name, reach: aud ? Math.round((a / aud) * 1000) / 1000 : 0, adopters: Math.round(a) };
  });
  const weekly: number[] = [];
  for (let d = 6; d < res.days; d += 7) weekly.push(Math.round(res.curve.mean[d]));
  if ((res.days - 1) % 7 !== 6) weekly.push(Math.round(res.curve.mean[res.days - 1]));
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    reach: { mean: r3(res.reach.mean), p10: r3(res.reach.p10), p90: r3(res.reach.p90) },
    adopters: { mean: Math.round(res.adopters.mean), p10: Math.round(res.adopters.p10), p90: Math.round(res.adopters.p90) },
    naturalAudience: Math.round(res.naturalAudience),
    cost: res.cost,
    costPerPoint: res.reach.mean > 0 && res.cost > 0 ? Math.round(res.cost / (res.reach.mean * 100)) : null,
    wordOfMouthShare: credited > 0 ? r3(res.attribution.wordOfMouth / credited) : 0,
    cellsReached: res.cellsReached,
    weekly,
    byDistrict,
    topActions: actions
      .map((a) => ({ id: a.id, label: a.label, adopters: Math.round(res.attribution.actions[a.id] ?? 0), cost: a.cost }))
      .sort((x, y) => y.adopters - x.adopters),
  };
}

/** Per-cell adoption (adopters ÷ natural audience) for each frame, as base64 bytes 0–255. */
export function encodeFrames(res: SimResult): { days: number[]; data: string[] } {
  const enc = (cells: Float64Array) => {
    const bytes = new Uint8Array(cells.length);
    cells.forEach((x, i) => {
      const aud = res.audienceByCell[i];
      bytes[i] = aud > 0 ? Math.min(255, Math.round((x / aud) * 255)) : 0;
    });
    return Buffer.from(bytes).toString("base64");
  };
  return { days: res.frames.map((f) => f.day), data: res.frames.map((f) => enc(f.cells)) };
}

export function runPlan(atlas: CityAtlas, fit: number[], actions: Action[], days: number, opts: Partial<Params> = {}, travel?: number[]) {
  const res = simulate(gridOf(atlas, fit, travel), actions, paramsFor(days, { frameDays: frameDaysFor(days), ...opts }));
  return { result: res, metrics: metricsOf(res, atlas, actions) };
}
