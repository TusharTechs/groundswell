// The Scouts: an agent that chooses partner places in the hot zones. It asks
// Qloo for places near each zone whose crowd over-indexes on the comparables
// (optionally narrowed to categories it chooses), then picks three or four per
// zone that suit the launch, each with a role and a reason. Hard rules stay in
// code: no schools, places of worship, clinics, gun or cannabis shops; no bars
// for all-ages briefs; never the launch's own venue; only places Qloo returned
// in this run.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Zone } from "../launch/fit";
import { allowedPartner, nearestCell, PARTNER_ROLES, scoutPartners, type Partner } from "../launch/scout";
import type { Signals } from "../qloo/entities";
import { placeCategoryTags, placesNear, type Evidence, type Place } from "../qloo/entities";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Emit } from "./events";
import type { RunState } from "./state";

const SYSTEM = `You are the Scouts on a launch team. In each hot zone, you choose the real local places to partner with: where to put posters, sell or drop tickets, host a pop-up, base a street team, or cross-promote. Qloo tells you which places this launch's crowd over-indexes on (affinity, 0–1).

Tools:
- places: places near a zone that this crowd over-indexes on, optionally narrowed to categories in plain words (for example "record store", "coffee shop", "barber shop", "bookstore", "comedy club", "boutique").
- pick: your partners for a zone, each with a role and a short reason grounded in the data.
- finish: when every zone has partners.

Choosing well:
- Prefer independent local places this crowd already goes to over global chains (chains have popularity near 1); use a chain only if nothing else fits.
- Match the launch: a comedy night suits cafés, bookstores, barbers, community spaces; a concert suits record stores, cafés, venues, and bars when allowed; a shop launch suits boutiques, cafés, galleries.
- Mix roles; a pop-up host needs room for an event. Places open on weekends suit street teams.
- Work in parallel: call places for every zone in one turn, then pick for every zone in one turn, then finish.

Every tool takes a short note for the viewer: one plain sentence, under 20 words.`;

const note = z.string().describe("One plain sentence for the viewer, under 20 words.");

export async function runScouts(s: RunState, emit: Emit, zones: Zone[], signals: Signals): Promise<{ partners: Partner[]; evidence: Evidence[] }> {
  const evidence: Evidence[] = [];
  const seen = new Map<number, Map<string, Place>>();
  const picked = new Map<number, Partner[]>();
  let finished = false;
  const names = new Map((s.taste?.comps ?? []).map((c) => [c.id, c.name]));
  const say = (text: string) => emit({ type: "thought", agent: "scout", text });
  const receipts = (calls: Evidence[]) => {
    evidence.push(...calls);
    s.evidence.push(...calls);
    if (calls.length) emit({ type: "qloo", agent: "scout", calls });
  };
  const safe = (fn: () => Promise<string>) =>
    fn().catch((e) => {
      if (e instanceof RefusalError) throw e;
      return JSON.stringify({ error: (e as Error).message });
    });
  const zoneOf = (id: number) => {
    const z = zones.find((x) => x.id === id);
    if (!z) throw new Error(`Unknown zone ${id}. Zones: ${zones.map((x) => x.id).join(", ")}`);
    return z;
  };

  const places = betaZodTool({
    name: "places",
    description: "Places near a zone whose crowd over-indexes on the comparables, optionally narrowed to categories (plain words).",
    inputSchema: z.object({ note, zone_id: z.number().int(), categories: z.array(z.string().max(40)).max(4).optional() }),
    run: ({ note: n, zone_id, categories }) =>
      safe(async () => {
        const zone = zoneOf(zone_id);
        say(n);
        let include: string[] | undefined;
        if (categories?.length) {
          const t = await placeCategoryTags(categories);
          receipts(t.evidence);
          include = t.ids.length ? t.ids : undefined;
        }
        const r = await placesNear(zone.center, 1.6, signals, { take: 20, includeTagIds: include });
        receipts([r.evidence]);
        const ok = r.places.filter((p) => allowedPartner(p, s.spec));
        const map = seen.get(zone_id) ?? new Map<string, Place>();
        for (const p of ok) map.set(p.id, p);
        seen.set(zone_id, map);
        return JSON.stringify({
          zone: zone.locality,
          categories_used: include ?? "any",
          places: ok.map((p) => ({
            id: p.id,
            name: p.name,
            categories: p.categories.slice(0, 2),
            affinity: Number(p.affinity.toFixed(3)),
            popularity: p.popularity !== undefined ? Number(p.popularity.toFixed(2)) : null,
            rating: p.rating ?? null,
            open_days: p.openDays.length ? p.openDays.length : "unknown",
            open_weekends: p.openDays.includes("saturday") || p.openDays.includes("sunday"),
            pulled_in_by: p.drivers[0] ? names.get(p.drivers[0].id) ?? null : null,
          })),
          removed_by_rules: r.places.length - ok.length,
        });
      }),
  });

  const pick = betaZodTool({
    name: "pick",
    description: "Choose partners for one zone: up to 5 places returned by `places` for that zone, each with a role and a reason.",
    inputSchema: z.object({
      note,
      zone_id: z.number().int(),
      picks: z
        .array(z.object({ id: z.string(), role: z.enum(PARTNER_ROLES), why: z.string().describe("Under 18 words, grounded in the data (affinity, category, opening days).") }))
        .min(1)
        .max(5),
    }),
    run: ({ note: n, zone_id, picks }) =>
      safe(async () => {
        const zone = zoneOf(zone_id);
        const pool = seen.get(zone_id);
        if (!pool) throw new Error("Call places for this zone first.");
        const unknown = picks.filter((p) => !pool.has(p.id)).map((p) => p.id);
        if (unknown.length) throw new Error(`Not returned for zone ${zone_id}: ${unknown.join(", ")}`);
        const taken = new Set([...picked.entries()].filter(([z]) => z !== zone_id).flatMap(([, ps]) => ps.map((p) => p.id)));
        const dupes = picks.filter((p) => taken.has(p.id)).map((p) => p.id);
        if (dupes.length) throw new Error(`Already picked in another zone: ${dupes.join(", ")}`);
        say(n);
        picked.set(
          zone_id,
          picks.map((x) => {
            const p = pool.get(x.id)!;
            return { ...p, zone: zone.id, cell: nearestCell(s.atlas, p.lon, p.lat), role: x.role, why: x.why };
          }),
        );
        return JSON.stringify({ ok: true, zones_done: [...picked.keys()], zones_left: zones.filter((z) => !picked.has(z.id)).map((z) => z.id) });
      }),
  });

  const finish = betaZodTool({
    name: "finish",
    description: "Finish once every zone has partners.",
    inputSchema: z.object({ note }),
    run: ({ note: n }) =>
      safe(async () => {
        const missing = zones.filter((z) => !picked.has(z.id)).map((z) => z.id);
        if (missing.length && picked.size < Math.min(2, zones.length)) throw new Error(`Pick partners for zones ${missing.join(", ")} first.`);
        say(n);
        finished = true;
        return JSON.stringify({ ok: true });
      }),
  });

  const brief = [
    `Launch: ${s.spec.title} (${s.spec.kind}). ${s.spec.pitch}`,
    `Constraints: ${[s.spec.constraints.allAges ? "all ages" : "", s.spec.constraints.noAlcohol ? "no alcohol-led partners" : "", ...s.spec.constraints.notes].filter(Boolean).join("; ") || "none"}.${s.spec.venue ? ` Venue: ${s.spec.venue}.` : ""}`,
    `Comparables: ${(s.taste?.comps ?? []).map((c) => c.name).join(", ")}.`,
    `Zones:\n${zones.map((z) => `- zone ${z.id}: ${z.locality ?? "unnamed"} (${s.atlas.districts[z.district]?.name}), ${(z.audienceShare * 100).toFixed(1)}% of the natural audience`).join("\n")}`,
  ].join("\n");

  try {
    const runner = claude().beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 12000,
      ...FALLBACK,
      output_config: { effort: "low" },
      max_iterations: 8,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [places, pick, finish],
      messages: [{ role: "user", content: brief }],
    });
    for await (const message of runner) {
      s.llmCalls++;
      if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
      if (finished) break;
    }
  } catch (e) {
    if (e instanceof RefusalError) throw e;
  }

  const partners = [...picked.values()].flat();
  if (partners.length) return { partners, evidence };
  // The agent produced nothing usable: fall back to the strongest allowed places per zone.
  const fallback = await scoutPartners(s.atlas, zones, signals, s.spec);
  receipts(fallback.evidence);
  return { partners: fallback.partners, evidence };
}
