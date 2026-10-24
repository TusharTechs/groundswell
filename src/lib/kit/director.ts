// The Creative Director: an agent that writes the launch's copy, neighbourhood
// by neighbourhood. Before it can use a cultural reference in a zone's copy
// it checks it on Qloo for that zone (how over-represented the reference's
// fans are in the zone's cells); the submit tool rejects references that were
// not checked or are weak there, copy without its link placeholder, and
// promotional claims nobody can back up.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { toGh6 } from "../atlas/build";
import { loadAtlas } from "../atlas/store";
import { fitFromHeat, rawFitFromHeat } from "../launch/fit";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import { heatmap, resolveEntity, type Evidence } from "../qloo/entities";
import { ENTITY_TYPES, type EntityType } from "../qloo/params";
import { prettyDate, trackedLinks } from "./build";
import type { Kit, KitInput, ZoneCopy } from "./types";

export type KitEvent = { type: "kit-step"; text: string } | { type: "kit-check"; name: string; zone: string; verdict: string } | { type: "kit"; kit: Kit } | { type: "error"; message: string };

/** Claims that a launch's own copy can't back up. */
/** Assumptions about a partner's premises that the data can't show. */
const ASSUMED = /\b(you|they) (have|'ve got|got) (the |plenty of |enough )?(room|space)\b|\bhas (the |plenty of |enough )?(room|space)\b|\b(the highest|more than any other)\b/i;

const UNBACKED = /\b(sold[- ]out|selling fast|award[- ]winning|guaranteed|#1|number one|best in (the )?(city|town|world)|critically acclaimed|limited seats left|only \d+ (tickets|seats) left)\b/i;

const SYSTEM = `You are the Creative Director on a launch team. You write the launch's copy for each hot zone where the plan runs: a poster headline and subline, an Instagram caption, a TikTok or Reels hook with three beats, and a post for X or Threads. Then a host-read script for each podcast in the plan, and a short outreach email to each partner place.

The copy should sound like it belongs in that neighbourhood. You may use cultural references (artists, shows, brands, places) to do that, but only ones that check out: call check_reference for a reference in a zone before using it there. Use references that come back "strong here" or "mixed"; never use "weak here" ones in that zone. The launch's comparables are safe to name as "for fans of".

Rules:
- Use only the facts given: title, pitch, venue, date, comparables, partners and why they fit. Never invent prices, line-ups, guests, statistics or quotes.
- Affinity scores say how closely a place's visitors match fans of the comparables. The launch itself is new and has no fans in the data: write "people who love Kali Uchis and Omar Apollo", never "her fans" or "our fans". Don't assume what a place has (space, a stage, staff) or what it is (independent, family-run) beyond its category and why it fits.
- Don't rank a place against others ("the highest", "more than any other place"); say how closely its visitors match.
- Give dates as dates; never "this Friday" or "tomorrow": posts go out over several weeks.
- References are taste cues only. State no facts about the people, shows or brands you reference: no tours, releases, news, awards or quotes.
- Language: write the posters, posts, hooks and emails in the city's language (given in the brief), keeping names as they are. When that isn't English, also give an English translation of each zone's poster, Instagram and X copy and of each email. Write podcast host-reads in English unless the podcast's name is in the city's language.
- The poster already prints the date, the venue and a "for fans of" line under the subline; the subline says something else.
- No unbackable claims: no "sold out", "selling fast", "award-winning", "guaranteed", "#1", "limited seats left".
- Put the placeholder {link} where the link goes in the Instagram caption, the X post, each podcast script and each email. Code replaces it with a tracked link.
- Respect the brief: say 21+ or all ages when the brief does; no alcohol promotion for all-ages or no-alcohol launches.
- Emails: one friendly paragraph to the place by name; say why their crowd fits using the reason given (taste data, not flattery); make the ask that matches the partner's role (poster spot, ticket outlet, pop-up host, street-team base, cross-promotion); include exactly one bracketed placeholder for what the organiser can offer, such as "[your offer, e.g. two guest-list spots]".
- Never mention or imply ethnicity, religion, health, politics or other personal traits of people in a neighbourhood. Describe tastes only.
- Work in parallel: check several references in one turn, then submit everything in one call.`;

export async function runCreativeDirector(input: KitInput, emit: (e: KitEvent) => void): Promise<Kit> {
  const atlas = await loadAtlas(input.cityId);
  const evidence: Evidence[] = [];
  const checks: Kit["checks"] = [];
  const verdicts = new Map<string, string>(); // `${zone}|${name lowercased}` → verdict
  let submitted: Pick<Kit, "tagline" | "blurb" | "english" | "hashtags" | "zones" | "podcasts" | "partners"> | null = null;
  const links = trackedLinks(input);
  const zoneById = new Map(input.zones.map((z) => [z.id, z]));
  const safe = (fn: () => Promise<string>) =>
    fn().catch((e) => {
      if (e instanceof RefusalError) throw e;
      return JSON.stringify({ error: (e as Error).message });
    });

  const check = betaZodTool({
    name: "check_reference",
    description: "Check a cultural reference for one zone on Qloo: how over-represented its fans are in that zone's neighbourhood cells. Returns 'strong here', 'mixed' or 'weak here'.",
    inputSchema: z.object({
      name: z.string().min(1).max(80),
      type: z.enum(ENTITY_TYPES),
      zone_id: z.number().int(),
    }),
    run: ({ name, type, zone_id }) =>
      safe(async () => {
        const zone = zoneById.get(zone_id);
        if (!zone) throw new Error(`Unknown zone ${zone_id}. Zones: ${input.zones.map((x) => x.id).join(", ")}`);
        const r = await resolveEntity(name, type as EntityType);
        evidence.push(r.evidence);
        if (!r.entity) {
          checks.push({
            name,
            type,
            zone: zone_id,
            verdict: "not found on Qloo",
            score: null,
          });
          verdicts.set(`${zone_id}|${name.toLowerCase()}`, "not found");
          return JSON.stringify({
            name,
            verdict: "not found on Qloo; don't use it",
          });
        }
        const h = await heatmap(atlas.city.center, atlas.city.radiusKm, {
          entityIds: [r.entity.id],
        });
        evidence.push(h.evidence);
        const g = toGh6(h.cells);
        const covered = rawFitFromHeat(atlas, g).filter((f) => f > 0).length / atlas.cells.length;
        const fit = fitFromHeat(atlas, g);
        const cells = zone.cells.filter((i) => i >= 0 && i < fit.length);
        const score = cells.length ? cells.reduce((t, i) => t + fit[i], 0) / cells.length : 0;
        const verdict = covered < 0.1 ? "weak here" : score >= 0.6 ? "strong here" : score >= 0.42 ? "mixed" : "weak here";
        const key = `${zone_id}|${r.entity.name.toLowerCase()}`;
        verdicts.set(key, verdict);
        verdicts.set(`${zone_id}|${name.toLowerCase()}`, verdict);
        checks.push({
          name: r.entity.name,
          query: name,
          type,
          zone: zone_id,
          verdict,
          score: Math.round(score * 100) / 100,
        });
        emit({
          type: "kit-check",
          name: r.entity.name,
          zone: zone.locality,
          verdict,
        });
        return JSON.stringify({
          name: r.entity.name,
          zone: zone.locality,
          verdict,
          score: Math.round(score * 100) / 100,
        });
      }),
  });

  const submit = betaZodTool({
    name: "submit_kit",
    description: "Submit all the copy in one call.",
    inputSchema: z.object({
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
    }),
    run: (k) =>
      safe(async () => {
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
        if (problems.length) return JSON.stringify({ ok: false, problems });
        submitted = {
          tagline: k.tagline,
          blurb: k.blurb,
          ...(k.english ? { english: k.english } : {}),
          hashtags: k.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
          zones: k.zones.map((z): ZoneCopy => ({
            zoneId: z.zone_id,
            references: z.references.map((name) => {
              const c = [...checks].reverse().find((x) => x.zone === z.zone_id && [x.name, x.query].some((n) => n?.toLowerCase() === name.toLowerCase()));
              return {
                name,
                verdict: c?.verdict ?? "comparable",
                score: c?.score ?? null,
              };
            }),
            posterHeadline: z.poster_headline,
            posterSubline: z.poster_subline,
            instagram: z.instagram,
            tiktokHook: z.tiktok_hook,
            tiktokBeats: z.tiktok_beats.slice(0, 3),
            xPost: z.x_post,
            ...(z.english ? { english: { posterHeadline: z.english.poster_headline, posterSubline: z.english.poster_subline, instagram: z.english.instagram, xPost: z.english.x_post } } : {}),
          })),
          podcasts: k.podcasts.map((p, i) => ({
            name: p.name,
            script: p.script,
            code: `pod${i + 1}`,
          })),
          partners: k.partners.map((p) => ({
            id: p.id,
            code: `e${input.partners.findIndex((x) => x.id === p.id) + 1}`,
            subject: p.subject,
            body: p.body,
            ...(p.english ? { english: p.english } : {}),
          })),
        };
        // The kit is complete; stop before the agent composes a closing message.
        stop.abort();
        return JSON.stringify({ ok: true });
      }),
  });

  const brief = [
    `Launch: ${input.title}. ${input.pitch}`,
    `City: ${atlas.city.name}. Language: ${input.language}. ${input.venue ? `Venue: ${input.venue}. ` : ""}Launch day: ${prettyDate(input.launchDate)}. ${input.allAges ? "All ages." : input.ageLimit ? `Age limit: ${input.ageLimit}.` : ""}${input.noAlcohol ? " No alcohol promotion." : ""}`,
    `Comparables (safe to name as "for fans of"): ${input.comps.join(", ")}. Fans over-index on tags: ${input.tags.slice(0, 6).join(", ") || "none given"}.`,
    `Zones:\n${input.zones.map((z) => `- zone ${z.id}: ${z.locality} (${z.district}; leans toward ${z.signature.join(", ")})`).join("\n")}`,
    `Partners:\n${input.partners.map((p) => `- ${p.id}: ${p.name} (${p.category}) in zone ${p.zone}; role ${p.role ?? "poster"}; why: ${p.why ?? `Qloo affinity ${p.affinity.toFixed(2)}`}${p.popupDaysBefore !== null ? `; pop-up ${p.popupDaysBefore} days before launch` : ""}`).join("\n") || "none"}`,
    `Podcasts in the plan: ${input.podcasts.map((p) => p.name).join(", ") || "none"}.`,
    `Write the kit and submit it.`,
  ].join("\n\n");

  emit({
    type: "kit-step",
    text: `Writing copy for ${input.zones.length} neighbourhoods, ${input.partners.length} partners and ${input.podcasts.length} podcast${input.podcasts.length === 1 ? "" : "s"}`,
  });
  const stop = new AbortController();
  const runner = claude().beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 24000,
      ...FALLBACK,
      output_config: { effort: "low" },
      max_iterations: 8,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [check, submit],
      messages: [{ role: "user", content: brief }],
    },
    { signal: stop.signal },
  );
  try {
    for await (const message of runner) {
      if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
      if (submitted) break;
    }
  } catch (e) {
    // Aborting after the kit is submitted is expected; anything else is a real failure.
    if (!submitted) throw e;
  }
  if (!submitted) throw new Error("The Creative Director did not finish the kit. Try again.");
  const done = submitted as Pick<Kit, "tagline" | "blurb" | "english" | "hashtags" | "zones" | "podcasts" | "partners">;
  return {
    campaignId: input.campaignId,
    createdAt: new Date().toISOString(),
    input,
    ...done,
    links,
    checks,
    qlooCalls: evidence.filter((e) => !e.cached).length,
  };
}
