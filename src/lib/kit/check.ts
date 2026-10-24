// The Creative Director's submit checks, as a pure function so they can be
// tested: references must have been checked on Qloo for their neighbourhood and
// come back strong or mixed; every piece of copy needs its tracked link; no
// unbackable claims, and no assumptions about a partner's premises.

import { z } from "zod";
import type { KitInput } from "./types";

/** Claims that a launch's own copy can't back up. */
export const UNBACKED =
  /\b(sold[- ]out|selling fast|award[- ]winning|guaranteed|#1|number one|best in (the )?(city|town|world)|critically acclaimed|limited seats left|only \d+ (tickets|seats) left)\b/i;

/** Assumptions about a partner's premises, or rankings, that the data can't show. */
export const ASSUMED = /\b(you|they) (have|'ve got|got) (the |plenty of |enough )?(room|space)\b|\bhas (the |plenty of |enough )?(room|space)\b|\b(the highest|more than any other)\b/i;

/** What the Creative Director submits. */
export const KitDraft = z.object({
  tagline: z.string().describe("At most 8 words, in the city's language."),
  blurb: z.string().describe("Two sentences for the launch page, in the city's language: what it is and why to come. At most 45 words."),
  english: z.object({ tagline: z.string(), blurb: z.string() }).nullable().describe("Tagline and blurb in English when the city's language isn't English; otherwise null."),
  hashtags: z.array(z.string()).max(3).describe("Up to three, without spaces."),
  zones: z.array(
    z.object({
      zone_id: z.number().int(),
      references: z.array(z.string()).max(4).describe("Every cultural reference used in this zone's copy, other than the comparables."),
      poster_headline: z.string().describe("At most 7 words."),
      poster_subline: z.string().describe("At most 16 words."),
      instagram: z.string().describe("At most 70 words, with {link}."),
      tiktok_hook: z.string().describe("The first spoken line, at most 15 words."),
      tiktok_beats: z.array(z.string()).describe("Three short beats."),
      x_post: z.string().describe("At most 240 characters, with {link}."),
      english: z
        .object({ poster_headline: z.string(), poster_subline: z.string(), instagram: z.string(), x_post: z.string() })
        .nullable()
        .describe("English translation when the city's language isn't English; otherwise null."),
    }),
  ),
  podcasts: z.array(
    z.object({
      name: z.string(),
      script: z.string().describe("A 30–40 second host-read, at most 90 words, with {link}."),
    }),
  ),
  partners: z.array(
    z.object({
      id: z.string(),
      subject: z.string().describe("At most 10 words."),
      body: z.string().describe("At most 130 words, with {link}."),
      english: z.object({ subject: z.string(), body: z.string() }).nullable().describe("English translation when the city's language isn't English; otherwise null."),
    }),
  ),
});
export type KitDraft = z.infer<typeof KitDraft>;

/**
 * Everything wrong with a draft, as instructions the agent can act on; empty
 * when the draft can ship. `verdicts` maps "zoneId|reference" (lower case) to
 * the Qloo check's verdict.
 */
export function kitProblems(input: KitInput, k: KitDraft, verdicts: Map<string, string>): string[] {
  const zoneById = new Map(input.zones.map((z) => [z.id, z]));
  const problems: string[] = [];
  const compNames = new Set(input.comps.map((c) => c.toLowerCase()));
  for (const z of k.zones) {
    const zone = zoneById.get(z.zone_id);
    if (!zone) {
      problems.push(`Unknown zone ${z.zone_id}.`);
      continue;
    }
    for (const ref of z.references) {
      if (compNames.has(ref.toLowerCase())) continue;
      const v = verdicts.get(`${z.zone_id}|${ref.toLowerCase()}`);
      if (!v) problems.push(`"${ref}" in ${zone.locality} wasn't checked: call check_reference for zone ${z.zone_id}.`);
      else if (v !== "strong here" && v !== "mixed") problems.push(`"${ref}" is ${v} in ${zone.locality}; take it out of that zone's copy.`);
    }
    if (!z.instagram.includes("{link}") || !z.x_post.includes("{link}")) problems.push(`${zone.locality}: Instagram and X copy need {link}.`);
    if (z.x_post.replace("{link}", "").length > 250) problems.push(`${zone.locality}: the X post is too long.`);
    const text = [z.poster_headline, z.poster_subline, z.instagram, z.tiktok_hook, ...z.tiktok_beats, z.x_post].join(" ");
    if (UNBACKED.test(text)) problems.push(`${zone.locality}: remove claims like "${text.match(UNBACKED)?.[0]}".`);
  }
  if (input.language !== "English") {
    if (!k.english) problems.push("Add the English tagline and blurb.");
    const untranslated = [
      ...k.zones.filter((z) => !z.english).map((z) => zoneById.get(z.zone_id)?.locality ?? String(z.zone_id)),
      ...k.partners.filter((p) => !p.english).map((p) => `the email to ${p.id}`),
    ];
    if (untranslated.length) problems.push(`Add English translations for: ${untranslated.join(", ")}.`);
  }
  const missingZones = input.zones.filter((z) => !k.zones.some((x) => x.zone_id === z.id)).map((z) => z.locality);
  if (missingZones.length) problems.push(`Write copy for: ${missingZones.join(", ")}.`);
  for (const p of k.partners) {
    const partner = input.partners.find((x) => x.id === p.id);
    if (!partner) problems.push(`Unknown partner id ${p.id}.`);
    else {
      if (!p.body.includes("{link}")) problems.push(`Email to ${partner.name} needs {link}.`);
      if (UNBACKED.test(p.body)) problems.push(`Email to ${partner.name}: remove "${p.body.match(UNBACKED)?.[0]}".`);
      const assumed = p.body.match(ASSUMED) ?? p.english?.body.match(ASSUMED);
      if (assumed) problems.push(`Email to ${partner.name}: "${assumed[0]}" isn't something the data shows; take it out.`);
    }
  }
  const missingPartners = input.partners.filter((x) => !k.partners.some((p) => p.id === x.id)).map((x) => x.name);
  if (missingPartners.length) problems.push(`Write emails to: ${missingPartners.join(", ")}.`);
  for (const p of k.podcasts) if (!p.script.includes("{link}")) problems.push(`The ${p.name} script needs {link}.`);
  return problems;
}
