// One launch rehearsal: parse the brief, load the city model, let the Director
// run the team, and make sure a plan comes out even if the Director stops early.

import { randomUUID } from "node:crypto";
import { loadAtlas } from "../atlas/store";
import { encodeFrames, runPlan } from "../launch/simulate";
import { parseBrief } from "../launch/spec";
import { qlooUsage } from "../qloo/client";
import { runDirector } from "./director";
import type { Emit } from "./events";
import { runProducer } from "./producer";
import { actionsOf, type RunState } from "./state";

export interface LaunchInput {
  brief: string;
  cityId: string;
  budget?: number;
  days?: number;
}

export async function runLaunch(input: LaunchInput, emit: Emit): Promise<RunState> {
  const started = Date.now();
  const before = qlooUsage().networkCalls;
  const runId = randomUUID().slice(0, 8);
  emit({ type: "start", runId, brief: input.brief, cityId: input.cityId });
  emit({ type: "agent", agent: "director", state: "working", note: "Reading the brief" });
  const [spec, atlas] = await Promise.all([parseBrief(input.brief, input.cityId, { budget: input.budget, days: input.days }), loadAtlas(input.cityId)]);
  emit({ type: "spec", spec });
  const s: RunState = {
    runId,
    brief: input.brief,
    spec,
    atlas,
    strategies: new Map(),
    results: new Map(),
    rounds: 0,
    critiques: [],
    evidence: [],
    llmCalls: 1,
    started,
  };

  await runDirector(s, emit);

  // If the Director stopped before finalising, deliver the best simulated plan anyway.
  if (!s.finalized && s.results.size) {
    const best = [...s.results.entries()].sort((a, b) => b[1].reach.mean - a[1].reach.mean)[0][0];
    emit({ type: "agent", agent: "producer", state: "working", note: `Writing the launch plan for ${best}` });
    const plan = await runProducer(s, emit, best);
    const { result, metrics } = runPlan(atlas, s.fit!.fit, actionsOf(s, s.strategies.get(best)!.selections), spec.days, { runs: 96, seed: 11 }, s.fit!.travel);
    emit({ type: "plan", plan, sim: { strategyId: best, metrics, frames: encodeFrames(result) } });
    s.finalized = best;
    emit({ type: "agent", agent: "producer", state: "done", note: plan.headline });
  }
  if (!s.finalized) throw new Error("The team could not produce a plan for this brief. Try naming a few comparable artists, shows or brands.");

  emit({
    type: "done",
    stats: { qlooCalls: s.evidence.filter((e) => !e.cached).length || qlooUsage().networkCalls - before, llmCalls: s.llmCalls, ms: Date.now() - started, rounds: s.rounds },
  });
  return s;
}
