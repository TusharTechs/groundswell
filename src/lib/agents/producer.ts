// The Producer: turns the winning plan into a week-by-week launch plan. The
// facts (places, addresses, numbers) come from the run; the model writes the
// sequencing and the words.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Emit, PlanView } from "./events";
import { describeMetrics, strategyView, type RunState } from "./state";

const Schema = z.object({
  headline: z.string().describe("At most 14 words: the plan's core bet and its simulated reach of the natural audience. No head-counts."),
  summary: z.string().describe("Three sentences: the bet, why the taste data supports it, what to expect."),
  weeks: z.array(z.object({ label: z.string().describe("e.g. 'Week 1 (days 0–6)' or 'Launch week'."), items: z.array(z.string()) })),
  partners: z.array(z.object({ id: z.string().describe("The partner's menu id."), action: z.string().describe("What to do there, in under 15 words."), why: z.string().describe("Why this place, in under 20 words, from the Qloo evidence.") })),
  media: z.array(z.object({ id: z.string().describe("The podcast or collab's menu id."), action: z.string(), why: z.string() })),
  risks: z.array(z.string()).describe("2–4 risks or assumptions to watch, including model limits."),
  measure: z.array(z.string()).describe("2–4 things to measure each week to know it is working."),
});

const SYSTEM = `You are the Producer on a launch team. You turn the winning plan into a launch plan a small team can run: week by week, place by place.

Use only the actions in the plan and the facts given. Keep it concrete and short. Say plainly that projections come from a simulation built on Qloo taste data, not a guarantee.

Talk about results as reach of the natural audience (the people in the city whose taste fits the launch), as a multiple of the benchmark, and as cost per point of reach. Never state numbers of people, adopters or tickets: the simulation's population scale is arbitrary.`;

export async function runProducer(s: RunState, emit: Emit, strategyId: string): Promise<PlanView> {
  const st = s.strategies.get(strategyId);
  const m = s.results.get(strategyId);
  if (!st || !m) throw new Error("Pick a simulated plan to finalise.");
  const view = strategyView(s, st);
  const partners = view.steps.filter((x) => x.kind === "partner" || x.kind === "popup");
  const media = view.steps.filter((x) => x.kind === "podcast" || x.kind === "collab");
  const content = [
    `Launch: ${s.spec.title}. ${s.spec.pitch} City: ${s.atlas.city.name}. ${s.spec.days} days to launch day. Budget $${s.spec.budget}.`,
    `Winning plan ${st.id} "${st.name}": ${st.thesis}`,
    `Actions:\n${view.steps.map((x) => `- ${x.id} | ${x.label} | ${x.when} | $${x.cost} | ${s.menuById?.get(x.id)?.why ?? ""}`).join("\n")}`,
    `Simulated result: ${describeMetrics(m)}`,
    s.baseline ? `Benchmark, the same budget where people are: ${describeMetrics(s.baseline)}` : "",
    s.voices?.strategyId === strategyId ? `Street voices (simulated): ${s.voices.voices.map((v) => `${v.name} in ${v.where}: "${v.quote}" (${v.stance}; would change mind: ${v.change})`).join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 10000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  s.llmCalls++;
  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  const p = response.parsed_output;
  if (!p) throw new Error("The launch plan could not be read.");
  const place = (id: string) => s.partners?.find((x) => `partner:${x.id}` === id || `popup:${x.id}` === id);
  const plan: PlanView = {
    strategyId,
    headline: p.headline,
    summary: p.summary,
    weeks: p.weeks,
    partners: p.partners.flatMap((x) => {
      const pl = place(x.id);
      return pl && partners.some((y) => y.id === x.id) ? [{ name: pl.name, address: pl.address, action: x.action, why: x.why, website: pl.website }] : [];
    }),
    media: p.media.flatMap((x) => {
      const step = media.find((y) => y.id === x.id);
      return step ? [{ name: step.label, action: x.action, why: x.why }] : [];
    }),
    risks: p.risks,
    measure: p.measure,
  };
  return plan;
}
