// The Critic: reads simulated results and says what to change.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Critique, Emit } from "./events";
import { describeMetrics, describeZones, type RunState } from "./state";

const Schema = z.object({
  best: z.string().describe("Id of the strongest plan so far, weighing mean reach, the 10th-percentile outcome and cost."),
  summary: z.string().describe("Two sentences for the launch team: what is working and what is not."),
  findings: z.array(z.object({ strategy: z.string(), finding: z.string().describe("One sentence, citing numbers.") })),
  changes: z.array(z.object({ change: z.string().describe("A concrete edit naming menu items, zones or days."), why: z.string() })).describe("2–4 changes for the next round."),
});

const SYSTEM = `You are the Critic on a launch team. You read simulation results for launch plans and tell the Strategist what to change.

Look for: money spent where little of the natural audience lives; strong zones left unseeded; seeding too late for word of mouth to spread; actions credited with few adopters for their cost; plans that win on the mean but have a weak 10th-percentile outcome. Compare with the benchmark plan that spends the same budget where people are, without taste data.

Be specific and brief. Name menu ids, zones and days. Never invent data that is not in the results. Talk in reach percentages and cost per point of reach, never head-counts.`;

export async function runCritic(s: RunState, emit: Emit, ids: string[]): Promise<Critique> {
  const plans = ids.flatMap((id) => {
    const st = s.strategies.get(id);
    const m = s.results.get(id);
    return st && m ? [`${id} "${st.name}" ($${st.cost}): ${st.thesis}\n  selections: ${JSON.stringify(st.selections)}\n  ${describeMetrics(m)}`] : [];
  });
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Launch: ${s.spec.title} in ${s.atlas.city.name}, budget $${s.spec.budget}, ${s.spec.days} days to launch.`,
          `Hot zones:\n${describeZones(s)}`,
          s.baseline ? `Benchmark (same budget where people are, no taste data): ${describeMetrics(s.baseline)}` : "",
          `Plans:\n${plans.join("\n\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  s.llmCalls++;
  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  const c = response.parsed_output;
  if (!c) throw new Error("The Critic's notes could not be read.");
  const critique: Critique = { best: ids.includes(c.best) ? c.best : ids[0], summary: c.summary, findings: c.findings, changes: c.changes.slice(0, 4) };
  s.critiques.push(critique);
  emit({ type: "critique", round: s.rounds, critique });
  return critique;
}
