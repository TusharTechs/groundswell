"use client";

// One reducer folds the event stream into the view. A live run feeds it from
// the server stream; a recorded run feeds it the same events on a compressed
// clock, so both render identically.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { AgentName, Critique, LaunchEvent, MediaView, PartnerView, PlanView, SimView, StrategyView, Voice } from "@/lib/agents/events";
import type { Candidate } from "@/lib/launch/actions";
import type { Zone } from "@/lib/launch/fit";
import type { LaunchSpec } from "@/lib/launch/spec";
import type { Evidence } from "@/lib/qloo/entities";

export interface FeedItem {
  id: number;
  agent: AgentName;
  kind: "status" | "thought" | "qloo" | "strategies" | "sim" | "critique" | "voices" | "plan" | "error";
  text: string;
  calls?: Evidence[];
  round?: number;
}

export type AgentState = { state: "idle" | "working" | "done"; note: string };

export interface RunView {
  started: boolean;
  runId?: string;
  brief?: string;
  cityId?: string;
  spec?: LaunchSpec;
  agents: Record<AgentName, AgentState>;
  active?: AgentName;
  feed: FeedItem[];
  qloo: Evidence[];
  taste?: Extract<LaunchEvent, { type: "taste" }>;
  fit?: { fit: Uint8Array; zones: Zone[]; districts: { district: number; meanFit: number; audienceShare: number }[]; naturalAudience: number; venue?: { name: string; lon: number; lat: number; address?: string } };
  zones?: Zone[];
  partners?: PartnerView[];
  media?: MediaView[];
  candidates?: Candidate[];
  brandHeat?: Record<string, string>;
  strategies: StrategyView[];
  sims: Record<string, SimView>;
  baseline?: SimView;
  critiques: Critique[];
  voices?: Voice[];
  plan?: { plan: PlanView; sim: SimView };
  done?: Extract<LaunchEvent, { type: "done" }>["stats"];
  error?: string;
  rounds: number;
}

const AGENT_IDS: AgentName[] = ["director", "analyst", "cartographer", "scout", "strategist", "simulator", "critic", "voices", "producer"];

export const initialView = (): RunView => ({
  started: false,
  agents: Object.fromEntries(AGENT_IDS.map((a) => [a, { state: "idle", note: "" }])) as Record<AgentName, AgentState>,
  feed: [],
  qloo: [],
  strategies: [],
  sims: {},
  critiques: [],
  rounds: 0,
});

export function decodeBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type Action = { type: "event"; e: LaunchEvent } | { type: "reset" };

function reduce(s: RunView, action: Action): RunView {
  if (action.type === "reset") return initialView();
  const e = action.e;
  const push = (item: Omit<FeedItem, "id">): FeedItem[] => [...s.feed, { id: s.feed.length, ...item }];
  switch (e.type) {
    case "start":
      return { ...initialView(), started: true, runId: e.runId, brief: e.brief, cityId: e.cityId };
    case "spec":
      return { ...s, spec: e.spec };
    case "agent": {
      const agents = { ...s.agents, [e.agent]: { state: e.state, note: e.note } };
      const feed = e.state === "done" && e.agent !== "director" ? push({ agent: e.agent, kind: "status", text: e.note }) : e.state === "working" && e.agent !== "director" ? push({ agent: e.agent, kind: "status", text: `${e.note}…` }) : s.feed;
      return { ...s, agents, active: e.state === "working" ? e.agent : s.active === e.agent ? undefined : s.active, feed };
    }
    case "thought":
      return { ...s, feed: push({ agent: e.agent, kind: "thought", text: e.text }) };
    case "qloo": {
      const last = s.feed[s.feed.length - 1];
      // Fold consecutive receipts from the same agent into one line.
      if (last && last.kind === "qloo" && last.agent === e.agent) {
        const calls = [...(last.calls ?? []), ...e.calls];
        const feed = [...s.feed.slice(0, -1), { ...last, calls, text: `${calls.length} Qloo call${calls.length === 1 ? "" : "s"}` }];
        return { ...s, qloo: [...s.qloo, ...e.calls], feed };
      }
      return { ...s, qloo: [...s.qloo, ...e.calls], feed: push({ agent: e.agent, kind: "qloo", text: `${e.calls.length} Qloo call${e.calls.length === 1 ? "" : "s"}`, calls: e.calls }) };
    }
    case "taste":
      return { ...s, taste: e };
    case "fit":
      return { ...s, fit: { ...e, fit: decodeBytes(e.fit) }, zones: e.zones };
    case "menu":
      return { ...s, zones: e.zones ?? s.zones, partners: e.partners, media: e.media, candidates: e.candidates, brandHeat: e.brandHeat };
    case "baseline":
      return { ...s, baseline: e.sim };
    case "strategies":
      return {
        ...s,
        rounds: Math.max(s.rounds, e.round),
        strategies: [...s.strategies.filter((x) => !e.strategies.some((y) => y.id === x.id)), ...e.strategies],
        feed: push({ agent: "strategist", kind: "strategies", text: e.strategies.map((x) => `${x.id} “${x.name}”`).join(" · "), round: e.round }),
      };
    case "sim": {
      const sims = { ...s.sims };
      for (const r of e.results) sims[r.strategyId] = r;
      const best = [...e.results].sort((a, b) => b.metrics.reach.mean - a.metrics.reach.mean)[0];
      return { ...s, sims, feed: push({ agent: "simulator", kind: "sim", text: e.results.map((r) => `${r.strategyId} ${pct(r.metrics.reach.mean)}`).join(" · ") + (best ? ` · best ${best.strategyId}` : ""), round: e.round }) };
    }
    case "critique":
      return { ...s, critiques: [...s.critiques, e.critique], feed: push({ agent: "critic", kind: "critique", text: e.critique.summary, round: e.round }) };
    case "voices":
      return { ...s, voices: e.voices, feed: push({ agent: "voices", kind: "voices", text: `${e.voices.filter((v) => v.stance === "in").length} of ${e.voices.length} residents are in` }) };
    case "plan":
      return { ...s, plan: { plan: e.plan, sim: e.sim }, sims: { ...s.sims, [e.sim.strategyId]: e.sim }, feed: push({ agent: "producer", kind: "plan", text: e.plan.headline }) };
    case "done":
      return { ...s, done: e.stats, active: undefined };
    case "error":
      return { ...s, error: e.message, active: undefined, feed: push({ agent: "director", kind: "error", text: e.message }) };
  }
}

export function useRunView() {
  const [view, dispatch] = useReducer(reduce, undefined, initialView);
  const feed = useCallback((e: LaunchEvent) => dispatch({ type: "event", e }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  return { view, feed, reset };
}

/** Start a live rehearsal and stream its events into `feed`. */
export async function streamLive(
  input: { brief: string; cityId: string; budget?: number; days?: number },
  feed: (e: LaunchEvent) => void,
  signal: AbortSignal,
) {
  const res = await fetch("/api/rehearse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  if (!res.ok || !res.body) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => null);
    feed({ type: "error", message: msg ?? "The rehearsal could not start." });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) feed(JSON.parse(line.slice(6)) as LaunchEvent);
    }
  }
}

/**
 * Replay a recorded run on a compressed clock: short gaps play at real speed,
 * long model pauses are shortened. `skip()` applies everything left at once.
 */
export function useReplay(events: { t: number; e: LaunchEvent }[] | null, feed: (e: LaunchEvent) => void) {
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const index = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = useCallback(() => {
    if (!events) return;
    const i = index.current;
    if (i >= events.length) {
      setPlaying(false);
      setFinished(true);
      return;
    }
    feed(events[i].e);
    index.current = i + 1;
    const next = events[i + 1];
    if (!next) {
      setPlaying(false);
      setFinished(true);
      return;
    }
    const gap = next.t - events[i].t;
    const delay = Math.max(90, Math.min(1900, gap * 0.32));
    timer.current = setTimeout(step, delay);
  }, [events, feed]);

  useEffect(() => {
    if (!events || !events.length) return;
    index.current = 0;
    setFinished(false);
    setPlaying(true);
    timer.current = setTimeout(step, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [events, step]);

  const skip = useCallback(() => {
    if (!events) return;
    if (timer.current) clearTimeout(timer.current);
    for (let i = index.current; i < events.length; i++) feed(events[i].e);
    index.current = events.length;
    setPlaying(false);
    setFinished(true);
  }, [events, feed]);

  return { playing, finished, skip };
}
