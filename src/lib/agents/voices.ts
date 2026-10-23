// Street Voices: simulated residents of the city's hot zones react to a plan.
// Each persona is grounded only in Qloo data about where they live: the
// district's taste signature and the real places nearby. Labelled as simulated.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Emit, Voice } from "./events";
import { strategyView, type RunState } from "./state";

const Schema = z.object({
  voices: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().describe("A common first name only."),
      quote: z.string().describe("What they'd say if a reporter asked about this launch and how they heard of it. 1–2 sentences, natural speech."),
      stance: z.enum(["in", "maybe", "out"]),
      change: z.string().describe("What would change their mind or make them bring a friend, in under 15 words."),
    }),
  ),
});

const SYSTEM = `You write short street interviews with simulated residents of a city, reacting to an upcoming launch and the way it is being promoted.

Each resident is defined only by where they live and that area's measured taste (from Qloo's taste graph) and the real places nearby. Their reaction must follow from that: people in areas whose taste matches the launch are interested; people whose taste doesn't match are lukewarm or uninterested, politely.

Rules:
- Base each person only on the tastes and places listed. Do not mention or imply ethnicity, religion, income, health, politics or other personal traits.
- Natural, specific, unpolished speech. No marketing language.
- These are simulations for a planning tool; keep them plausible and kind.`;

export async function runVoices(s: RunState, emit: Emit, strategyId: string): Promise<Voice[]> {
  const st = s.strategies.get(strategyId);
  if (!st || !s.fit) throw new Error("Simulate a plan before interviewing residents.");
  const view = strategyView(s, st);
  const atlas = s.atlas;
  // Three hot zones and one contrasting district where the fit is weakest.
  const picks = s.fit.zones.slice(0, 3).map((z) => ({ district: z.district, where: z.locality ?? "the city", center: z.center, zone: z.id }));
  const weakest = [...s.fit.districts].sort((a, b) => a.meanFit - b.meanFit)[0];
  if (weakest) {
    const d = atlas.districts[weakest.district];
    picks.push({ district: d.id, where: d.places[0] ?? d.name, center: d.center, zone: -1 });
  }
  const people = picks.map((p, i) => {
    const d = atlas.districts[p.district];
    const tastes = d.signature.slice(0, 4).map((x) => atlas.probes[x.probe].label);
    const nearby = (s.partners ?? []).filter((x) => x.zone === p.zone).slice(0, 2).map((x) => `${x.name} (${x.categories[0] ?? "place"})`);
    return { id: i, ...p, districtName: d.name, tastes, nearby };
  });
  const content = [
    `Launch: ${s.spec.title}. ${s.spec.pitch} In ${atlas.city.name}, ${s.spec.days} days from now.`,
    `How it is being promoted: ${view.steps.map((x) => `${x.label} (${x.when})`).join("; ")}.`,
    `Residents:\n${people
      .map((p) => `${p.id}. Lives in ${p.where}. Their area over-indexes on ${p.tastes.join(", ")}.${p.nearby.length ? ` Nearby places this crowd loves: ${p.nearby.join(", ")}.` : ""}`)
      .join("\n")}`,
  ].join("\n\n");
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  s.llmCalls++;
  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The street interviews could not be read.");
  const voices: Voice[] = parsed.voices.flatMap((v) => {
    const p = people.find((x) => x.id === v.id);
    return p ? [{ name: v.name, where: p.where, district: p.districtName, lon: p.center[0], lat: p.center[1], tastes: p.tastes, quote: v.quote, stance: v.stance, change: v.change }] : [];
  });
  s.voices = { strategyId, voices };
  emit({ type: "voices", strategyId, voices });
  return voices;
}
