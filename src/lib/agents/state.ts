// The shared state of one launch run, and compact text views of it for the agents.

import type { Action } from "@groundswell/sim";
import type { CityAtlas } from "../atlas/types";
import { toAction, type Candidate, type MenuContext, type Selection } from "../launch/actions";
import type { FitMap } from "../launch/fit";
import type { BrandOption, MediaOption, Partner } from "../launch/scout";
import type { PlanMetrics } from "../launch/simulate";
import type { LaunchSpec } from "../launch/spec";
import type { TasteProfile } from "../launch/taste";
import type { Evidence } from "../qloo/entities";
import type { Critique, StrategyView, Voice } from "./events";

export interface Strategy {
  id: string;
  round: number;
  name: string;
  thesis: string;
  selections: Selection[];
  cost: number;
}

export interface RunState {
  runId: string;
  brief: string;
  spec: LaunchSpec;
  atlas: CityAtlas;
  taste?: TasteProfile;
  fit?: FitMap;
  partners?: Partner[];
  podcasts?: MediaOption[];
  brands?: BrandOption[];
  menu?: Candidate[];
  menuById?: Map<string, Candidate>;
  baseline?: PlanMetrics;
  strategies: Map<string, Strategy>;
  results: Map<string, PlanMetrics>;
  rounds: number;
  critiques: Critique[];
  voices?: { strategyId: string; voices: Voice[] };
  finalized?: string;
  evidence: Evidence[];
  llmCalls: number;
  started: number;
}

export function menuContext(s: RunState): MenuContext {
  if (!s.fit || !s.partners || !s.podcasts || !s.brands) throw new Error("Scout the city before planning.");
  return {
    atlas: s.atlas,
    fit: s.fit.fit,
    zones: s.fit.zones,
    partners: s.partners,
    podcasts: s.podcasts,
    brands: s.brands,
    days: s.spec.days,
    names: new Map((s.taste?.comps ?? []).map((c) => [c.id, c.name])),
  };
}

export function actionsOf(s: RunState, selections: Selection[]): Action[] {
  const ctx = menuContext(s);
  return selections.flatMap((sel) => toAction(sel, ctx, s.menuById!) ?? []);
}

export function whenOf(c: Candidate, sel: Selection, days: number): string {
  const dayLabel = (d: number) => {
    const before = days - 1 - d;
    return before === 0 ? "launch day" : `${before} day${before === 1 ? "" : "s"} before launch`;
  };
  if (c.timing === "campaign") return "whole campaign";
  if (c.timing === "day") return dayLabel(sel.day ?? 0);
  const start = sel.start ?? 0;
  const len = sel.days ?? 14;
  return `${len} days from ${dayLabel(start)}`;
}

export function strategyView(s: RunState, st: Strategy): StrategyView {
  return {
    ...st,
    steps: st.selections.flatMap((sel) => {
      const c = s.menuById?.get(sel.id);
      if (!c) return [];
      const cost = c.kind === "social" ? c.cost * Math.max(1, sel.days ?? 14) : c.cost;
      return [{ id: sel.id, kind: c.kind, label: c.label, when: whenOf(c, sel, s.spec.days), cost }];
    }),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Results for the agents, in relative terms only: the simulation's population scale is arbitrary, so head-counts would be false precision. */
export function describeMetrics(m: PlanMetrics): string {
  const share = (n: number) => (m.adopters.mean > 0 ? pct(n / m.adopters.mean) : "0%");
  return [
    `reach ${pct(m.reach.mean)} of the natural audience (10th–90th percentile ${pct(m.reach.p10)}–${pct(m.reach.p90)})`,
    `cost $${m.cost}${m.costPerPoint ? `, $${m.costPerPoint} per point of reach` : ""}, word of mouth ${pct(m.wordOfMouthShare)} of adoption`,
    `by district: ${m.byDistrict.map((d) => `${d.name} ${pct(d.reach)}`).join("; ")}`,
    `top actions by share of adoption credited: ${m.topActions.slice(0, 5).map((a) => `${a.label} (${share(a.adopters)}, $${a.cost})`).join("; ")}`,
    m.topActions.length > 5 ? `weakest: ${m.topActions.slice(-3).map((a) => `${a.label} (${share(a.adopters)}, $${a.cost})`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n  ");
}

export function describeMenu(s: RunState): string {
  const days = s.spec.days;
  const lines = (s.menu ?? []).map((c) => {
    const unit = c.kind === "street" ? "per day" : c.kind === "social" ? "per day of ads" : "";
    const timing = c.timing === "campaign" ? "runs the whole campaign" : c.timing === "day" ? "pick a day" : "pick start and length";
    return `- ${c.id} | ${c.kind} | ${c.label} | $${c.cost} ${unit} | ${timing} | ${c.why}`;
  });
  return `Campaign length: ${days} days (day 0 = today, day ${days - 1} = launch day).\n${lines.join("\n")}`;
}

export function describeZones(s: RunState): string {
  if (!s.fit) return "";
  return s.fit.zones
    .map((z) => `- zone ${z.id}: ${z.locality ?? "unnamed"} (${s.atlas.districts[z.district]?.name}), mean fit ${z.fit}, ${pct(z.audienceShare)} of the natural audience`)
    .join("\n");
}
