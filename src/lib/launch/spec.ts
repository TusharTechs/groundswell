// Step 0: turn a plain-language launch brief into a structured spec.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CITIES } from "../atlas/cities";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import { AGE_BANDS, ENTITY_TYPES, type AgeBand, type EntityType } from "../qloo/params";

export const LAUNCH_KINDS = ["concert", "comedy", "restaurant", "retail", "popup", "film", "sports", "product", "exhibition", "nightlife", "other"] as const;
export type LaunchKind = (typeof LAUNCH_KINDS)[number];

export interface LaunchSpec {
  title: string;
  kind: LaunchKind;
  cityId: string;
  pitch: string;
  /** Comparable artists, shows, brands or places whose fans are this launch's natural audience. */
  comps: { name: string; type: EntityType }[];
  age: AgeBand | null;
  venue: string | null;
  /** Days from today to launch day. */
  days: number;
  budget: number;
  capacity: number | null;
  constraints: { allAges: boolean; noAlcohol: boolean; notes: string[] };
  goal: "attendance" | "awareness" | "sales";
}

const Schema = z.object({
  title: z.string().describe("A short name for the launch, under 8 words."),
  kind: z.enum(LAUNCH_KINDS),
  pitch: z.string().describe("One sentence describing what is launching and for whom."),
  comps: z
    .array(z.object({ name: z.string(), type: z.enum(ENTITY_TYPES) }))
    .describe(
      "2–4 well-known comparable artists, comedians (type person), shows, brands or places whose fans are the natural audience. Use names from the brief when given; otherwise choose the closest well-known comparables.",
    ),
  age: z.enum(AGE_BANDS).nullable().describe("Only if the brief names an age group."),
  venue: z.string().nullable().describe("The venue or location named in the brief, if any."),
  days: z.number().int().describe("Days until launch day. Default 42 if not given."),
  budget: z.number().describe("Promotion budget in US dollars. Default 12000 if not given."),
  capacity: z.number().int().nullable().describe("Tickets, seats or covers to fill, if given."),
  allAges: z.boolean().describe("True if the event is all ages or aimed at minors."),
  noAlcohol: z.boolean().describe("True if partners must not be bars or alcohol-led, or the brief says so."),
  notes: z.array(z.string()).describe("Other constraints in the brief, each under 12 words."),
  goal: z.enum(["attendance", "awareness", "sales"]),
});

const SYSTEM = `You turn a launch brief into a structured spec for a launch-planning simulator.

The brief describes something launching in a city: a show, a comedy night, a restaurant, a store, a pop-up, a film screening, a product drop, a sports event, an exhibition.

Rules:
- Comparables drive everything downstream: they must be real, well-known entities whose fans are the people this launch is for. Prefer artists and comedians (type person for comedians and athletes), TV shows, brands, and well-known places. Never invent names.
- Keep numbers the brief gives. If none are given, use the defaults in the field descriptions.
- Do not infer anyone's ethnicity, religion, health or other sensitive traits; describe tastes only.`;

export async function parseBrief(brief: string, cityId: string, overrides: { budget?: number; days?: number } = {}): Promise<LaunchSpec> {
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) throw new Error(`Unknown city "${cityId}".`);
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `City: ${city.name}, ${city.country}\n\n<brief>\n${brief}\n</brief>` }],
  });
  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  const p = response.parsed_output;
  if (!p) throw new Error("Could not read the launch brief.");
  const seen = new Set<string>();
  return {
    title: p.title.trim(),
    kind: p.kind,
    cityId,
    pitch: p.pitch.trim(),
    comps: p.comps
      .filter((c) => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4),
    age: p.age,
    venue: p.venue,
    days: clamp(Math.round(overrides.days ?? p.days ?? 42), 14, 84),
    budget: clamp(Math.round(overrides.budget ?? p.budget ?? 12000), 1000, 250000),
    capacity: p.capacity && p.capacity > 0 ? p.capacity : null,
    constraints: { allAges: p.allAges, noAlcohol: p.noAlcohol || p.allAges, notes: p.notes.slice(0, 5) },
    goal: p.goal,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
