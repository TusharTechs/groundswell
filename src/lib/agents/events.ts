// Everything a launch run streams to the browser. Recorded runs are the same
// events with timestamps, so a replay and a live run render identically.

import type { Candidate, Selection } from "../launch/actions";
import type { CityProspect } from "../launch/expansion";
import type { Zone } from "../launch/fit";
import type { PlanMetrics } from "../launch/simulate";
import type { LaunchSpec } from "../launch/spec";
import type { AgeBand } from "../qloo/params";
import type { Evidence } from "../qloo/entities";

export type AgentName = "director" | "analyst" | "cartographer" | "scout" | "strategist" | "simulator" | "critic" | "voices" | "producer";

export const AGENTS: Record<AgentName, { title: string; role: string }> = {
  director: { title: "Director", role: "Agent: runs the rehearsal and decides what to do next." },
  analyst: { title: "Taste Analyst", role: "Agent: chooses comparables Qloo covers well in this city, and profiles their fans." },
  cartographer: { title: "Cartographer", role: "Tool: maps where in the city the taste lives (Qloo heatmap)." },
  scout: { title: "Scouts", role: "Agent: picks real partner places in each hot zone, each with a role." },
  strategist: { title: "Strategist", role: "Agent: designs launch plans and tests variations in the simulator." },
  simulator: { title: "Simulator", role: "Engine: rehearses each plan 48 times in the model of the city." },
  critic: { title: "Critic", role: "Model: reads the results and says what to change." },
  voices: { title: "Street Voices", role: "Model: simulated residents react to the plan." },
  producer: { title: "Producer", role: "Model: turns the winning plan into a week-by-week plan." },
};

export interface PartnerView {
  id: string;
  name: string;
  category: string;
  address?: string;
  lon: number;
  lat: number;
  zone: number;
  /** Atlas cell the place sits in. */
  cell: number;
  affinity: number;
  rating?: number;
  website?: string;
  phone?: string;
  /** What the Scouts want from this partner and why (from the Scout agent). */
  role?: string;
  why?: string;
  drivers: { name: string; share: number }[];
}

export interface MediaView {
  id: string;
  name: string;
  kind: "podcast" | "brand";
  affinity: number;
  popularity?: number;
}

export interface StrategyView {
  id: string;
  round: number;
  name: string;
  thesis: string;
  selections: Selection[];
  cost: number;
  /** Labels of the selected actions, in order. */
  steps: { id: string; kind: Candidate["kind"]; label: string; when: string; cost: number }[];
}

export interface SimView {
  strategyId: string;
  metrics: PlanMetrics;
  frames: { days: number[]; data: string[] };
}

export interface Critique {
  best: string;
  summary: string;
  findings: { strategy: string; finding: string }[];
  changes: { change: string; why: string }[];
}

export interface Voice {
  name: string;
  where: string;
  district: string;
  lon: number;
  lat: number;
  tastes: string[];
  quote: string;
  stance: "in" | "maybe" | "out";
  change: string;
}

export interface PlanView {
  strategyId: string;
  headline: string;
  summary: string;
  weeks: { label: string; items: string[] }[];
  partners: { name: string; address?: string; action: string; why: string; website?: string }[];
  media: { name: string; action: string; why: string }[];
  risks: string[];
  measure: string[];
}

export type LaunchEvent =
  | { type: "start"; runId: string; brief: string; cityId: string }
  | { type: "spec"; spec: LaunchSpec }
  | { type: "agent"; agent: AgentName; state: "working" | "done"; note: string }
  | { type: "thought"; agent: AgentName; text: string }
  | { type: "qloo"; agent: AgentName; calls: Evidence[] }
  | {
      type: "taste";
      comps: { id: string; name: string; type: string }[];
      unresolved: string[];
      age: Partial<Record<AgeBand, number>>;
      peakAge: AgeBand | null;
      segments: { name: string; affinity: number }[];
      tags: { name: string; affinity: number }[];
    }
  | {
      type: "fit";
      fit: string;
      zones: Zone[];
      districts: { district: number; meanFit: number; audienceShare: number }[];
      naturalAudience: number;
      venue?: { name: string; lon: number; lat: number; address?: string };
      travelKm?: number;
    }
  | {
      type: "menu";
      zones: Zone[];
      partners: PartnerView[];
      media: MediaView[];
      candidates: Candidate[];
      /** Per brand id: where its fans live, per atlas cell, as base64 bytes (0–255). For what-if runs in the browser. */
      brandHeat?: Record<string, string>;
    }
  | { type: "baseline"; label: string; sim: SimView }
  | { type: "strategies"; round: number; strategies: StrategyView[] }
  /** One variation the Strategist tested in the simulator before committing. */
  | { type: "probe"; round: number; cost: number; reach: number; actions: number; overBudget: boolean }
  | { type: "sim"; round: number; results: SimView[] }
  | { type: "critique"; round: number; critique: Critique }
  | { type: "voices"; strategyId: string; voices: Voice[] }
  /** The same launch in the other cities, strongest presence first. */
  | { type: "expansion"; prospects: CityProspect[] }
  | { type: "plan"; plan: PlanView; sim: SimView }
  | { type: "done"; stats: { qlooCalls: number; llmCalls: number; ms: number; rounds: number } }
  | { type: "error"; message: string };

export type Emit = (e: LaunchEvent) => void;
