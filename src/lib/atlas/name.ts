// Plain-language names for taste districts, written by Claude from each
// district's Qloo signature only. The UI labels them as model-written.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";

export interface DistrictBrief {
  id: number;
  over: { label: string; z: number; lift: number }[];
  under: { label: string; z: number; lift: number }[];
  places: string[];
  share: number;
}

const Names = z.object({
  districts: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().describe("2–5 plain words naming the taste, e.g. 'Latin pop and streetwear'. No place names, no slang, no 'vibes'."),
      blurb: z.string().describe("One sentence, at most 22 words, saying what this district over-indexes on, using only the listed signals."),
    }),
  ),
});

const SYSTEM = `You name taste districts on a city map. Each district is a group of neighbourhoods whose people over-index on the same things, measured by Qloo's taste graph.

You get each district's strongest over-indexes and under-indexes (z-scores against the rest of the city) and the neighbourhoods it covers.

Rules:
- Name the taste, not the place: "Country and classic rock", "K-pop, anime and Uniqlo", "Indie film and Patagonia".
- Use only the signals given. Do not infer ethnicity, income, religion, politics, health or any personal trait; describe tastes only.
- Names must be distinct from each other within the city.
- Plain words a reader understands at a glance.`;

export async function nameDistricts(city: string, briefs: DistrictBrief[]) {
  const content = briefs
    .map(
      (b) =>
        `District ${b.id} (${Math.round(b.share * 100)}% of the city's activity; covers ${b.places.slice(0, 5).join(", ") || "unnamed areas"})\n` +
        `  leans toward: ${b.over.map((o) => `${o.label} (${o.lift.toFixed(1)}× city average)`).join(", ")}\n` +
        `  leans away from: ${b.under.map((o) => `${o.label} (${o.lift.toFixed(1)}×)`).join(", ")}`,
    )
    .join("\n\n");
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Names) },
    system: SYSTEM,
    messages: [{ role: "user", content: `City: ${city}\n\n${content}` }],
  });
  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Could not read district names from the model's response.");
  return new Map(parsed.districts.map((d) => [d.id, { name: d.name, blurb: d.blurb }]));
}
