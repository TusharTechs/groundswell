// The Director: runs a launch rehearsal end to end. Its tools wrap the other
// agents and the Qloo work; it decides the order, retries what fails, chooses
// where to scout, and decides when a plan is good enough to finalise. Every
// tool call carries a short reason that is shown to the viewer.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { buildMenu, wherePeopleArePlan } from "../launch/actions";
import { scoutExpansion } from "../launch/expansion";
import { mapFit, type FitMap } from "../launch/fit";
import { resolveVenue, TRAVEL_SCALE_KM, travelWeights } from "../launch/venue";
import { scoutMedia } from "../launch/scout";
import { encodeFrames, runPlan } from "../launch/simulate";
import { signalsOf } from "../launch/taste";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import type { Evidence } from "../qloo/entities";
import { runAnalyst } from "./analyst";
import { runCritic } from "./critic";
import type { AgentName, Emit, LaunchEvent, PartnerView, SimView } from "./events";
import { runProducer } from "./producer";
import { actionsOf, describeMetrics, type RunState } from "./state";
import { runScouts } from "./scouts";
import { runStrategist } from "./strategist";
import { runVoices } from "./voices";

const MIN_ROUNDS = 2;
/** Live runs must finish inside a serverless function's limit; past these marks the Director is told to wrap up. */
const WRAP_UP_MS = 165_000;
const SKIP_EXTRAS_MS = 215_000;

const SYSTEM = `You are the Director of Groundswell, a team of agents that rehearses a launch in a model of a real city before anyone spends money. The city model is built from Qloo's taste graph: which neighbourhoods over-index on which artists, shows, brands and places.

Your goal: hand the launch team the plan that reaches the most of the launch's natural audience by launch day, within budget and the brief's constraints, and that holds up in bad runs (the 10th-percentile outcome), not just on average.

Your team (each is a tool):
- profile_taste: the Taste Analyst (an agent) chooses the launch's comparables on Qloo, checking each is well covered in this city, and profiles their fans. If the map that follows looks wrong for the launch, call it again with a hint.
- map_audience: the Cartographer maps where the taste lives and finds hot zones.
- scout: the Scouts (an agent) choose real partner places in the zones you pick, each with a role, and the podcasts and brands this crowd over-indexes on are found alongside. You choose the zones (usually the 3–5 strongest; skip a zone that is mostly downtown tourist traffic if the launch is local).
- plan: the Strategist designs plans and tests them in the simulator. Give it guidance.
- simulate: rehearse plans many times; it also runs the benchmark (the same budget spent where people are, without taste data).
- critique: the Critic reads results and proposes changes.
- interview: simulated residents of the hot zones react to a plan.
- scout_expansion: maps the same taste in the other cities, so the team can say where the launch could go next.
- finalize: the Producer writes the launch plan. This ends the run.

A good run: profile, map, scout, plan 3 different bets, simulate, critique, plan 2 revisions, simulate, (another round only if it is still improving), interview residents about the best plan and scout expansion (call both in one turn), finalize the best plan. Adapt when something fails or a result surprises you.

Write every reason as one short sentence for a viewer watching the team work (under 22 words), plain words, specific (name places, numbers).`;

const reason = z.string().describe("One short sentence for the viewer: why you're doing this now.");

export function pctOf(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export async function runDirector(s: RunState, emit: Emit) {
  const spec = s.spec;
  const step = (agent: AgentName, note: string) => emit({ type: "agent", agent, state: "working", note });
  const done = (agent: AgentName, note: string) => emit({ type: "agent", agent, state: "done", note });
  const receipts = (agent: AgentName, calls: Evidence[]) => {
    s.evidence.push(...calls);
    if (calls.length) emit({ type: "qloo", agent, calls });
  };
  const clock = () => Date.now() - s.started;
  const withTime = (out: string) => {
    if (s.finalized || clock() < WRAP_UP_MS) return out;
    const unsimulated = [...s.strategies.keys()].filter((id) => !s.results.has(id));
    const note = unsimulated.length
      ? `Time is nearly up: simulate ${unsimulated.join(", ")} now (it is instant), then finalize the best plan.`
      : s.rounds >= MIN_ROUNDS
        ? "Time is nearly up: finalize the best plan now."
        : "Time is nearly up: finish this round, then finalize the best plan.";
    return `${out}\n\n[${note}]`;
  };
  const guard = <I,>(fn: (input: I) => Promise<string>) => async (input: I) => {
    try {
      return withTime(await fn(input));
    } catch (e) {
      if (e instanceof RefusalError) throw e;
      return withTime(JSON.stringify({ error: (e as Error).message }));
    }
  };
  const say = (text: string) => emit({ type: "thought", agent: "director", text });

  const profileTool = betaZodTool({
    name: "profile_taste",
    description:
      "Hand the Taste Analyst (an agent) the brief: it resolves comparables on Qloo, checks how well each is covered in this city, swaps weak ones, and profiles their fans (age skew, audience segments, tags). Give a hint to steer it, for example after a weak map.",
    inputSchema: z.object({
      reason,
      hint: z.string().max(300).optional().describe("Optional steer for the Analyst, e.g. 'try comedians rather than sitcoms'."),
    }),
    run: guard(async ({ reason: why, hint }: { reason: string; hint?: string }) => {
      say(why);
      step("analyst", `Choosing comparables for ${s.atlas.city.name}`);
      const taste = await runAnalyst(s, emit, hint);
      s.taste = taste;
      emit({
        type: "taste",
        comps: taste.comps.map((c) => ({ id: c.id, name: c.name, type: c.type })),
        unresolved: taste.unresolved,
        age: taste.age,
        peakAge: taste.peakAge,
        segments: taste.segments.map((x) => ({ name: x.name, affinity: x.affinity })),
        tags: taste.tags.map((x) => ({ name: x.name, affinity: x.affinity })),
      });
      done("analyst", taste.comps.length ? `Fans of ${taste.comps.map((c) => c.name).join(", ")}${taste.peakAge ? `, skewing ${taste.peakAge.replaceAll("_", " ")}` : ""}` : "No comparables found");
      return JSON.stringify({
        comparables: taste.comps.map((c) => `${c.name} (${c.type})`),
        unresolved: taste.unresolved,
        fans_skew_age: taste.peakAge,
        age_skew: taste.age,
        segments: taste.segments.slice(0, 6).map((x) => x.name),
        tags: taste.tags.slice(0, 8).map((x) => x.name),
      });
    }),
  });

  const mapTool = betaZodTool({
    name: "map_audience",
    description: "Map where in the city the launch's taste lives (Qloo heatmap of the comparables' fans) and find hot zones.",
    inputSchema: z.object({ reason }),
    run: guard(async ({ reason: why }: { reason: string }) => {
      say(why);
      if (!s.taste?.comps.length) throw new Error("Profile the taste first; no comparables are resolved.");
      step("cartographer", `Mapping ${s.taste.comps.map((c) => c.name).join(" + ")} fans across ${s.atlas.city.name}`);
      let venue: FitMap["venue"];
      if (spec.venue) {
        const r = await resolveVenue(spec.venue, s.atlas);
        if (r.evidence) receipts("cartographer", [r.evidence]);
        if (r.venue) venue = { name: r.venue.name, lon: r.venue.lon, lat: r.venue.lat, address: r.venue.address };
      }
      const fit = await mapFit(s.atlas, signalsOf(s.taste, spec.age), venue ? travelWeights(s.atlas, venue) : undefined, venue);
      receipts("cartographer", [fit.evidence]);
      s.fit = fit;
      emit({
        type: "fit",
        fit: Buffer.from(Uint8Array.from(fit.fit.map((f) => Math.round(f * 255)))).toString("base64"),
        zones: fit.zones,
        districts: fit.districts,
        naturalAudience: fit.naturalAudience,
        venue: fit.venue,
        travelKm: fit.venue ? TRAVEL_SCALE_KM : undefined,
      });
      done("cartographer", `Hottest: ${fit.zones.slice(0, 3).map((z) => z.locality ?? "unnamed").join(", ")}`);
      return JSON.stringify({
        venue: fit.venue ? `${fit.venue.name} (people further away are less likely to travel; half as likely at ${(TRAVEL_SCALE_KM * Math.LN2).toFixed(1)} km)` : spec.venue ? `${spec.venue} not found on Qloo; no travel weighting` : "no venue",
        coverage: pctOf(fit.coverage),
        natural_audience: fit.naturalAudience,
        zones: fit.zones.map((z) => ({ id: z.id, where: z.locality, district: s.atlas.districts[z.district]?.name, fit: z.fit, share_of_audience: pctOf(z.audienceShare) })),
        districts: fit.districts.map((d) => ({ name: s.atlas.districts[d.district]?.name, share_of_audience: pctOf(d.audienceShare), mean_fit: d.meanFit })),
      });
    }),
  });

  const scoutTool = betaZodTool({
    name: "scout",
    description: "Send scouts to the chosen hot zones for real partner places this crowd loves, and find podcasts and brands it over-indexes on. Builds the action menu.",
    inputSchema: z.object({ reason, zones: z.array(z.number().int()).min(1).max(5).describe("Zone ids from map_audience.") }),
    run: guard(async ({ reason: why, zones }: { reason: string; zones: number[] }) => {
      say(why);
      if (!s.fit || !s.taste) throw new Error("Map the audience first.");
      const chosen = s.fit.zones.filter((z) => zones.includes(z.id));
      if (!chosen.length) throw new Error(`Unknown zones. Valid ids: ${s.fit.zones.map((z) => z.id).join(", ")}`);
      step("scout", `Scouting ${chosen.map((z) => z.locality ?? `zone ${z.id}`).join(", ")}`);
      const signals = signalsOf(s.taste, spec.age);
      const [p, m] = await Promise.all([runScouts(s, emit, chosen, signals), scoutMedia(s.atlas, signals)]);
      receipts("scout", m.evidence);
      s.partners = p.partners;
      s.podcasts = m.podcasts;
      s.brands = m.brands;
      const names = new Map(s.taste.comps.map((c) => [c.id, c.name]));
      s.menu = buildMenu({ atlas: s.atlas, fit: s.fit.fit, zones: s.fit.zones, partners: p.partners, podcasts: m.podcasts, brands: m.brands, days: spec.days, names });
      s.menuById = new Map(s.menu.map((c) => [c.id, c]));
      const partners: PartnerView[] = p.partners.map((x) => ({
        id: x.id,
        name: x.name,
        category: x.categories[0] ?? "Place",
        address: x.address,
        lon: x.lon,
        lat: x.lat,
        zone: x.zone,
        cell: x.cell,
        affinity: x.affinity,
        rating: x.rating,
        website: x.website,
        phone: x.phone,
        role: x.role,
        why: x.why,
        drivers: x.drivers.flatMap((d) => (names.get(d.id) ? [{ name: names.get(d.id)!, share: d.share }] : [])),
      }));
      emit({
        type: "menu",
        zones: s.fit.zones,
        partners,
        media: [
          ...m.podcasts.map((x) => ({ id: x.id, name: x.name, kind: "podcast" as const, affinity: x.affinity, popularity: x.popularity })),
          ...m.brands.map((x) => ({ id: x.id, name: x.name, kind: "brand" as const, affinity: x.affinity, popularity: x.popularity })),
        ],
        candidates: s.menu,
        brandHeat: Object.fromEntries(m.brands.map((b) => [b.id, Buffer.from(Uint8Array.from(b.heat.map((h) => Math.round(h * 255)))).toString("base64")])),
      });
      done("scout", `${p.partners.length} partner places, ${m.podcasts.length} podcasts, ${m.brands.length} brands`);
      return JSON.stringify({
        partners: p.partners.map((x) => `${x.name} (${x.categories[0] ?? "place"}, zone ${x.zone}${x.role ? `, ${x.role.replaceAll("_", " ")}` : ""})`),
        podcasts: m.podcasts.map((x) => x.name),
        brands: m.brands.map((x) => x.name),
        menu_size: s.menu.length,
      });
    }),
  });

  const planTool = betaZodTool({
    name: "plan",
    description: "Ask the Strategist for plans. First round: 3 different bets. Later rounds: 2 revisions that apply the Critic's notes.",
    inputSchema: z.object({ reason, count: z.number().int().min(1).max(3), guidance: z.string().describe("What to try or fix, in a sentence or two.") }),
    run: guard(async ({ reason: why, count, guidance }: { reason: string; count: number; guidance: string }) => {
      say(why);
      if (!s.menu?.length) throw new Error("Scout first; there is no action menu yet.");
      s.rounds++;
      step("strategist", s.rounds === 1 ? `Designing ${count} different bets` : `Revising: ${guidance}`);
      const plans = await runStrategist(s, emit, { round: s.rounds, count, guidance });
      done("strategist", plans.map((p) => `${p.id} ${p.name}`).join(" · "));
      return JSON.stringify(plans.map((p) => ({ id: p.id, name: p.name, thesis: p.thesis, cost: p.cost, actions: p.selections.length })));
    }),
  });

  const simulateTool = betaZodTool({
    name: "simulate",
    description: "Rehearse plans 48 times each in the city model (and the benchmark, the first time). Returns reach of the natural audience with a 10th–90th percentile band.",
    inputSchema: z.object({ reason, strategy_ids: z.array(z.string()).min(1).max(4) }),
    run: guard(async ({ reason: why, strategy_ids }: { reason: string; strategy_ids: string[] }) => {
      say(why);
      if (!s.fit) throw new Error("Map the audience first.");
      const unknown = strategy_ids.filter((id) => !s.strategies.has(id));
      if (unknown.length) throw new Error(`Unknown plans: ${unknown.join(", ")}. Known: ${[...s.strategies.keys()].join(", ")}`);
      step("simulator", `Rehearsing ${strategy_ids.join(", ")} 48 times each`);
      if (!s.baseline) {
        const { result, metrics } = runPlan(s.atlas, s.fit.fit, wherePeopleArePlan(s.atlas, spec.budget, spec.days), spec.days, {}, s.fit.travel);
        s.baseline = metrics;
        const sim: SimView = { strategyId: "benchmark", metrics, frames: encodeFrames(result) };
        emit({ type: "baseline", label: "Same budget, spent where people are", sim });
      }
      const results: SimView[] = strategy_ids.map((id) => {
        const { result, metrics } = runPlan(s.atlas, s.fit!.fit, actionsOf(s, s.strategies.get(id)!.selections), spec.days, {}, s.fit!.travel);
        s.results.set(id, metrics);
        return { strategyId: id, metrics, frames: encodeFrames(result) };
      });
      emit({ type: "sim", round: s.rounds, results });
      const best = [...results].sort((a, b) => b.metrics.reach.mean - a.metrics.reach.mean)[0];
      done("simulator", `Best: ${best.strategyId} at ${pctOf(best.metrics.reach.mean)} reach vs ${pctOf(s.baseline.reach.mean)} for the benchmark`);
      return JSON.stringify({
        benchmark: describeMetrics(s.baseline),
        plans: results.map((r) => ({ id: r.strategyId, result: describeMetrics(r.metrics) })),
      });
    }),
  });

  const critiqueTool = betaZodTool({
    name: "critique",
    description: "Ask the Critic to read simulated results and propose changes.",
    inputSchema: z.object({ reason, strategy_ids: z.array(z.string()).min(1).max(5) }),
    run: guard(async ({ reason: why, strategy_ids }: { reason: string; strategy_ids: string[] }) => {
      say(why);
      const ids = strategy_ids.filter((id) => s.results.has(id));
      if (!ids.length) throw new Error("Simulate plans before critiquing them.");
      step("critic", `Reading results for ${ids.join(", ")}`);
      const c = await runCritic(s, emit, ids);
      done("critic", c.summary);
      return JSON.stringify(c);
    }),
  });

  const interviewTool = betaZodTool({
    name: "interview",
    description: "Simulated residents of the hot zones (and one contrasting area) react to a plan.",
    inputSchema: z.object({ reason, strategy_id: z.string() }),
    run: guard(async ({ reason: why, strategy_id }: { reason: string; strategy_id: string }) => {
      say(why);
      if (!s.results.has(strategy_id)) throw new Error("Simulate this plan first.");
      if (clock() > SKIP_EXTRAS_MS) return JSON.stringify({ skipped: "No time left for interviews. Finalize now." });
      step("voices", "Asking residents across the city");
      const voices = await runVoices(s, emit, strategy_id);
      done("voices", `${voices.filter((v) => v.stance === "in").length} of ${voices.length} are in`);
      return JSON.stringify(voices.map((v) => ({ where: v.where, stance: v.stance, quote: v.quote, would_change_mind: v.change })));
    }),
  });

  const expansionTool = betaZodTool({
    name: "scout_expansion",
    description: "Map the same comparables in Groundswell's other cities: where the taste is most present, its strongest neighbourhoods there, and each city's taste twin of the home district. Quick; use it once before finalizing.",
    inputSchema: z.object({ reason }),
    run: guard(async ({ reason: why }: { reason: string }) => {
      if (!s.fit || !s.taste?.comps.length) throw new Error("Map the audience first.");
      if (s.expansion) return JSON.stringify({ already: true, prospects: s.expansion.slice(0, 3).map((p) => `${p.city} (presence ${p.presence}×)`) });
      say(why);
      step("cartographer", "Mapping the same taste in the other cities");
      const { prospects, evidence } = await scoutExpansion(s.atlas.city.id, s.taste.comps.map((c) => c.id), s.fit.districts[0]?.district ?? 0);
      receipts("cartographer", evidence);
      s.expansion = prospects;
      emit({ type: "expansion", prospects });
      done("cartographer", `Next strongest: ${prospects.slice(0, 2).map((p) => p.city).join(", ")}`);
      return JSON.stringify(prospects.map((p) => ({ city: p.city, presence: p.presence, strongest_in: p.places, district: p.district.name, twin_of_home_district: p.twin?.name ?? null })));
    }),
  });

  const finalizeTool = betaZodTool({
    name: "finalize",
    description: "The Producer writes the launch plan for the chosen strategy. Ends the run.",
    inputSchema: z.object({ reason, strategy_id: z.string() }),
    run: guard(async ({ reason: why, strategy_id }: { reason: string; strategy_id: string }) => {
      if (s.rounds < MIN_ROUNDS) throw new Error(`Run at least ${MIN_ROUNDS} rounds of plan → simulate → critique before finalising.`);
      if (!s.results.has(strategy_id)) throw new Error("Finalise a simulated plan.");
      const unsimulated = [...s.strategies.keys()].filter((id) => !s.results.has(id));
      if (unsimulated.length) throw new Error(`Simulate ${unsimulated.join(", ")} first (it is instant), so the choice uses every plan.`);
      say(why);
      step("producer", `Writing the launch plan for ${strategy_id}`);
      // Street voices and expansion run alongside the Producer when the Director hasn't called them yet.
      const extras: Promise<unknown>[] = [];
      if (s.voices?.strategyId !== strategy_id) {
        step("voices", "Asking residents across the city");
        extras.push(runVoices(s, emit, strategy_id).then((v) => done("voices", `${v.filter((x) => x.stance === "in").length} of ${v.length} are in`)).catch(() => done("voices", "Skipped")));
      }
      if (!s.expansion && s.fit && s.taste?.comps.length) {
        extras.push(
          scoutExpansion(s.atlas.city.id, s.taste.comps.map((c) => c.id), s.fit.districts[0]?.district ?? 0)
            .then(({ prospects, evidence }) => {
              receipts("cartographer", evidence);
              s.expansion = prospects;
              emit({ type: "expansion", prospects });
            })
            .catch(() => undefined),
        );
      }
      const [plan] = await Promise.all([runProducer(s, emit, strategy_id), ...extras]);
      const { result, metrics } = runPlan(s.atlas, s.fit!.fit, actionsOf(s, s.strategies.get(strategy_id)!.selections), spec.days, { runs: 96, seed: 11 }, s.fit!.travel);
      s.results.set(strategy_id, metrics);
      emit({ type: "plan", plan, sim: { strategyId: strategy_id, metrics, frames: encodeFrames(result) } });
      s.finalized = strategy_id;
      done("producer", plan.headline);
      // Nothing is left for the Director to say; stop before it composes a closing message.
      stop.abort();
      return JSON.stringify({ ok: true, note: "The plan is delivered. Stop now." });
    }),
  });

  const brief = [
    `Brief: ${s.brief}`,
    `Spec: ${JSON.stringify({ title: spec.title, kind: spec.kind, city: s.atlas.city.name, comps: spec.comps, age: spec.age, venue: spec.venue, days: spec.days, budget: spec.budget, capacity: spec.capacity, constraints: spec.constraints, goal: spec.goal })}`,
    `City model: ${s.atlas.cells.length} neighbourhood cells, ${s.atlas.districts.length} taste districts (${s.atlas.districts.map((d) => d.name).join("; ")}).`,
  ].join("\n");

  emit({ type: "agent", agent: "director", state: "working", note: "Planning the rehearsal" });
  const stop = new AbortController();
  const runner = claude().beta.messages.toolRunner(
    {
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low" },
    max_iterations: 22,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [profileTool, mapTool, scoutTool, planTool, simulateTool, critiqueTool, interviewTool, expansionTool, finalizeTool],
    messages: [{ role: "user", content: brief }],
    },
    { signal: stop.signal },
  );
  try {
    for await (const message of runner) {
      s.llmCalls++;
      if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
      if (s.finalized) break;
    }
  } catch (e) {
    // Aborting after the plan is delivered is expected; anything else is a real failure.
    if (!s.finalized) throw e;
  }
  emit({ type: "agent", agent: "director", state: "done", note: s.finalized ? `Delivered plan ${s.finalized}` : "Stopped before finalising" });
}

export type { LaunchEvent };
