// The Strategist: designs launch plans from the scouted menu, testing ideas in
// the simulator (fast expected-value runs) before submitting them. Its submit
// tool enforces the rules: only menu items, within budget, valid timings.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { selectionCost, type Selection } from "../launch/actions";
import { runPlan } from "../launch/simulate";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Emit } from "./events";
import { actionsOf, describeMenu, describeMetrics, describeZones, strategyView, type RunState, type Strategy } from "./state";

const SelectionSchema = z.object({
  id: z.string().describe("A menu id, e.g. 'partner:…', 'street:2', 'social:city'."),
  day: z.number().int().optional().describe("For day actions (popup, street, podcast): campaign day, 0 = today."),
  start: z.number().int().optional().describe("For span actions (social, collab): first day."),
  days: z.number().int().optional().describe("For span actions: number of days."),
});

const SYSTEM = `You are the Strategist on a launch team. You design promotion plans for a launch in one city, using only the actions on the menu, which the team's scouts built from Qloo's taste data: real partner places where this crowd goes, street-team and ad zones where the natural audience lives, podcasts and brands it over-indexes on.

A simulator scores plans: it models how many of the launch's natural audience (people in the city whose taste fits it) adopt by launch day, through promotion and word of mouth between neighbouring and taste-similar areas.

How to work:
- Call estimate to test ideas before committing; it is instant. Test four to eight variations at once by calling estimate several times in the same turn (different zones, timing, mixes), refine once with a second batch if it helps, then submit.
- Timing matters: word of mouth needs time to spread, so early seeding in the strongest zones compounds; a pop-up or street team close to launch day converts.
- Stay within the budget. Respect the brief's constraints.
- Plans must be things a real team would run: at most one co-branded drop, at most two podcasts, at most two pop-ups, street teams on specific days.
- When asked for several plans, make them genuinely different bets (for example: own the strongest neighbourhood, spread across several zones, lead with media), each with a one-sentence thesis.
- Finish by calling submit_plans exactly once.`;

export async function runStrategist(s: RunState, emit: Emit, opts: { round: number; count: number; guidance: string }) {
  const { spec } = s;
  const submitted: Strategy[] = [];
  const letter = String.fromCharCode(64 + opts.round); // A, B, C…

  const estimate = betaZodTool({
    name: "estimate",
    description: "Score a candidate plan instantly with the expected-value simulator. Returns reach of the natural audience, cost and the actions that did most.",
    inputSchema: z.object({ selections: z.array(SelectionSchema).min(1) }),
    run: async ({ selections }) => {
      try {
        const actions = actionsOf(s, selections);
        const cost = actions.reduce((t, a) => t + a.cost, 0);
        const { metrics } = runPlan(s.atlas, s.fit!.fit, actions, spec.days, { runs: 0 }, s.fit!.travel);
        emit({ type: "probe", round: opts.round, cost, reach: metrics.reach.mean, actions: actions.length, overBudget: cost > spec.budget });
        return JSON.stringify({
          cost,
          over_budget: cost > spec.budget,
          reach: metrics.reach.mean,
          cost_per_point_of_reach: metrics.costPerPoint,
          top: metrics.topActions.slice(0, 6).map((a) => ({ id: a.id, share_of_adoption: metrics.adopters.mean ? Math.round((a.adopters / metrics.adopters.mean) * 1000) / 1000 : 0, cost: a.cost })),
          weakest: metrics.topActions.slice(-3).map((a) => ({ id: a.id, share_of_adoption: metrics.adopters.mean ? Math.round((a.adopters / metrics.adopters.mean) * 1000) / 1000 : 0, cost: a.cost })),
        });
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message });
      }
    },
  });

  const submit = betaZodTool({
    name: "submit_plans",
    description: `Submit your ${opts.count} plan(s). Each must be within the $${spec.budget} budget and use only menu ids.`,
    inputSchema: z.object({
      plans: z
        .array(
          z.object({
            name: z.string().describe("2–5 words, e.g. 'Own Pilsen early'."),
            thesis: z.string().describe("One sentence: the bet this plan makes and why, citing the taste data."),
            selections: z.array(SelectionSchema).min(1),
          }),
        )
        .min(1),
    }),
    run: async ({ plans }) => {
      const problems: string[] = [];
      const accepted: Strategy[] = [];
      plans.forEach((p, k) => {
        const unknown = p.selections.filter((x) => !s.menuById!.has(x.id)).map((x) => x.id);
        if (unknown.length) return problems.push(`"${p.name}": not on the menu: ${unknown.join(", ")}`);
        const cost = p.selections.reduce((t, x) => t + selectionCost(s.menuById!.get(x.id)!, x, spec.days), 0);
        if (cost > spec.budget) return problems.push(`"${p.name}" costs $${cost}, over the $${spec.budget} budget.`);
        const kinds = (kind: string) => p.selections.filter((x) => s.menuById!.get(x.id)!.kind === kind).length;
        if (kinds("collab") > 1 || kinds("podcast") > 2 || kinds("popup") > 2) return problems.push(`"${p.name}" has more collabs, podcasts or pop-ups than a real team would run.`);
        accepted.push({ id: `${letter}${k + 1}`, round: opts.round, name: p.name, thesis: p.thesis, selections: p.selections as Selection[], cost });
      });
      if (problems.length) return JSON.stringify({ ok: false, problems, note: "Fix these and call submit_plans again with all plans." });
      submitted.splice(0, submitted.length, ...accepted);
      return JSON.stringify({ ok: true, ids: accepted.map((a) => a.id) });
    },
  });

  const history = [...s.strategies.values()].map((st) => {
    const m = s.results.get(st.id);
    return `${st.id} "${st.name}" ($${st.cost}): ${st.thesis}\n  selections: ${JSON.stringify(st.selections)}\n  ${m ? describeMetrics(m) : "not simulated"}`;
  });
  const critique = s.critiques[s.critiques.length - 1];
  const prompt = [
    `Launch: ${spec.title}. ${spec.pitch}`,
    `City: ${s.atlas.city.name}. Budget: $${spec.budget}. Goal: ${spec.goal}.${spec.capacity ? ` Capacity: ${spec.capacity}.` : ""}`,
    `Constraints: ${[spec.constraints.allAges ? "all ages" : "", spec.constraints.noAlcohol ? "no alcohol-led partners" : "", ...spec.constraints.notes].filter(Boolean).join("; ") || "none"}`,
    `Comparables on Qloo: ${s.taste?.comps.map((c) => c.name).join(", ")}. Fans skew ${s.taste?.peakAge?.replaceAll("_", " ") ?? "across ages"}; segments: ${s.taste?.segments.slice(0, 5).map((x) => x.name).join(", ")}.`,
    `Hot zones (where the natural audience lives):\n${describeZones(s)}`,
    s.baseline ? `Benchmark, the same budget spent where people are (no taste data): ${describeMetrics(s.baseline)}` : "",
    history.length ? `Plans so far:\n${history.join("\n")}` : "",
    critique ? `The Critic's latest notes: ${critique.summary}\nChanges suggested:\n${critique.changes.map((c) => `- ${c.change} (${c.why})`).join("\n")}` : "",
    `Director's guidance: ${opts.guidance}`,
    `Menu:\n${describeMenu(s)}`,
    `Design ${opts.count} plan${opts.count > 1 ? "s" : ""} and submit ${opts.count > 1 ? "them" : "it"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const runner = claude().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low" },
    max_iterations: 8,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [estimate, submit],
    messages: [{ role: "user", content: prompt }],
  });
  for await (const message of runner) {
    s.llmCalls++;
    if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
    if (submitted.length) break;
  }
  if (!submitted.length) throw new Error("The Strategist did not submit a plan.");
  for (const st of submitted) s.strategies.set(st.id, st);
  emit({ type: "strategies", round: opts.round, strategies: submitted.map((st) => strategyView(s, st)) });
  return submitted;
}
