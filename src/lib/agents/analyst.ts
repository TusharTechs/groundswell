// The Taste Analyst: an agent that chooses the launch's comparables. It
// resolves candidates on Qloo, checks how much of this city each one has
// street-level data for, swaps weak ones for better-covered alternatives, and
// submits two to four. Only entities that came from Qloo in this run can be
// submitted; then their fans are profiled.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { toGh6 } from "../atlas/build";
import { fitFromHeat, rawFitFromHeat } from "../launch/fit";
import { profileEntities, profileTaste, type TasteProfile } from "../launch/taste";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import { heatmap, recommend, resolveEntity, type Entity, type Evidence } from "../qloo/entities";
import { ENTITY_TYPES, type EntityType } from "../qloo/params";
import type { Emit } from "./events";
import type { RunState } from "./state";

const SYSTEM = `You are the Taste Analyst on a launch team. You choose the launch's comparables: two to four well-known artists, comedians (type person), athletes, shows, brands or places whose fans are the people this launch is for. Everything downstream (where the audience lives, which partners to approach) is computed from Qloo data about these comparables in this city, so they must be right for the launch and well covered in this city.

Tools:
- search: find an entity on Qloo by name and type.
- check_city: for entities you found, how much of this city Qloo has street-level data for (coverage) and where each is most over-represented. Below about 25% coverage a comparable is too sparse to map; films usually are.
- similar: Qloo's closest entities of the same type for one you found, to replace a sparse or off-target comparable.
- submit: your final two to four comparables.

Work quickly, in parallel: search all the brief's comparables in one turn, check them all in one turn, replace at most two that are sparse, missing or off-target (search or similar, then check, in one turn each), then submit. Keep a comparable the brief names unless it is clearly too sparse or off-target. Every tool takes a short note for the viewer: one plain sentence, under 20 words.`;

const note = z.string().describe("One plain sentence for the viewer, under 20 words.");

export async function runAnalyst(s: RunState, emit: Emit, hint?: string): Promise<TasteProfile> {
  const found = new Map<string, Entity>();
  const coverage = new Map<string, number>();
  let chosen: Entity[] | null = null;
  const say = (text: string) => emit({ type: "thought", agent: "analyst", text });
  const receipts = (calls: Evidence[]) => {
    s.evidence.push(...calls);
    if (calls.length) emit({ type: "qloo", agent: "analyst", calls });
  };
  const safe = (fn: () => Promise<string>) =>
    fn().catch((e) => {
      if (e instanceof RefusalError) throw e;
      return JSON.stringify({ error: (e as Error).message });
    });

  const search = betaZodTool({
    name: "search",
    description: "Find an entity on Qloo by name and type. Returns up to 5 candidates with ids.",
    inputSchema: z.object({ note, query: z.string().min(1).max(80), type: z.enum(ENTITY_TYPES) }),
    run: ({ note: n, query, type }) =>
      safe(async () => {
        say(n);
        const r = await resolveEntity(query, type as EntityType);
        receipts([r.evidence]);
        const list = (r.entity ? [r.entity, ...r.candidates.filter((c) => c.id !== r.entity!.id)] : r.candidates).slice(0, 5);
        for (const e of list) found.set(e.id, e);
        return JSON.stringify({
          match: r.entity ? r.entity.id : null,
          candidates: list.map((e) => ({ id: e.id, name: e.name, type: e.type, popularity: e.popularity && Number(e.popularity.toFixed(2)), note: e.disambiguation })),
        });
      }),
  });

  const checkCity = betaZodTool({
    name: "check_city",
    description: `For entities you found, how much of ${s.atlas.city.name} Qloo has street-level data for, and where each is most over-represented.`,
    inputSchema: z.object({ note, ids: z.array(z.string()).min(1).max(6) }),
    run: ({ note: n, ids }) =>
      safe(async () => {
        say(n);
        const unknown = ids.filter((id) => !found.has(id));
        if (unknown.length) throw new Error(`Search for these first: ${unknown.join(", ")}`);
        const heats = await Promise.all(ids.map((id) => heatmap(s.atlas.city.center, s.atlas.city.radiusKm, { entityIds: [id] })));
        receipts(heats.map((h) => h.evidence));
        return JSON.stringify(
          ids.map((id, k) => {
            const g = toGh6(heats[k].cells);
            const raw = rawFitFromHeat(s.atlas, g);
            const cov = raw.filter((f) => f > 0).length / raw.length;
            coverage.set(id, cov);
            const fit = fitFromHeat(s.atlas, g);
            const top = s.atlas.cells
              .map((c, i) => ({ i, f: fit[i] }))
              .sort((a, b) => b.f - a.f)
              .slice(0, 40);
            const places = new Map<string, number>();
            for (const t of top) {
              const l = s.atlas.cells[t.i].locality;
              if (l) places.set(l, (places.get(l) ?? 0) + 1);
            }
            return {
              id,
              name: found.get(id)!.name,
              coverage: `${Math.round(cov * 100)}%`,
              most_over_represented_in: [...places.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([p]) => p),
            };
          }),
        );
      }),
  });

  const similar = betaZodTool({
    name: "similar",
    description: "Qloo's closest entities of the same type for one you found (by shared fans), to replace a sparse or off-target comparable.",
    inputSchema: z.object({ note, id: z.string() }),
    run: ({ note: n, id }) =>
      safe(async () => {
        say(n);
        const base = found.get(id);
        if (!base) throw new Error("Search for it first.");
        const r = await recommend(base.type, { entityIds: [id] }, { take: 6, excludeIds: [id], popularityMin: 0.6 });
        receipts([r.evidence]);
        for (const e of r.items) found.set(e.id, e);
        return JSON.stringify(r.items.map((e) => ({ id: e.id, name: e.name, type: e.type, affinity: Number(e.affinity.toFixed(3)) })));
      }),
  });

  const submit = betaZodTool({
    name: "submit",
    description: "Submit the final two to four comparables (ids from search or similar, each checked with check_city).",
    inputSchema: z.object({ note, ids: z.array(z.string()).min(1).max(4) }),
    run: ({ note: n, ids }) =>
      safe(async () => {
        const unknown = ids.filter((id) => !found.has(id));
        if (unknown.length) throw new Error(`Not found on Qloo in this run: ${unknown.join(", ")}`);
        const unchecked = ids.filter((id) => !coverage.has(id));
        if (unchecked.length) throw new Error(`Check these in the city first: ${unchecked.join(", ")}`);
        const sparse = ids.filter((id) => (coverage.get(id) ?? 0) < 0.15);
        if (sparse.length === ids.length) throw new Error("Every comparable is too sparse in this city (under 15% coverage). Replace some.");
        say(n);
        chosen = ids.map((id) => found.get(id)!);
        // Done; stop before the agent composes a closing message.
        stop.abort();
        return JSON.stringify({ ok: true });
      }),
  });

  const brief = [
    `Launch: ${s.spec.title}. ${s.spec.pitch}`,
    `City: ${s.atlas.city.name}, ${s.atlas.city.country}.`,
    `Comparables suggested from the brief: ${s.spec.comps.map((c) => `${c.name} (${c.type})`).join(", ")}.`,
    s.spec.age ? `The brief names an age group: ${s.spec.age.replaceAll("_", " ")}.` : "",
    hint ? `Director's note: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const stop = new AbortController();
  const runner = claude().beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 8000,
      ...FALLBACK,
      output_config: { effort: "low" },
      max_iterations: 7,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [search, checkCity, similar, submit],
      messages: [{ role: "user", content: brief }],
    },
    { signal: stop.signal },
  );
  try {
    for await (const message of runner) {
      s.llmCalls++;
      if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
      if (chosen) break;
    }
  } catch (e) {
    // Aborting after the submit is expected; anything else is a real failure.
    if (!chosen) throw e;
  }

  // Profile exactly the entities chosen; if the agent ran out of turns, resolve the brief's comparables.
  const picked = chosen as Entity[] | null;
  const profile = picked ? await profileEntities(picked) : await profileTaste(s.spec.comps);
  receipts(profile.evidence);
  s.spec.comps = profile.comps.map((c) => ({ name: c.name, type: c.type }));
  return profile;
}
