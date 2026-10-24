// The Field Analyst: an agent that reads a running campaign's scans against
// the rehearsal's expectation and re-plans the budget not yet spent. It can
// search Qloo for new partner places in a neighbourhood; its submit tool
// rejects moves larger than what is left to move, new partners it didn't find
// on Qloo, and confident moves when the data are too thin to call.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Kit } from "../kit/types";
import { allowedPartner } from "../launch/scout";
import { claude, FALLBACK, MODEL, RefusalError } from "../llm";
import { placesNear, type Evidence, type Place } from "../qloo/entities";
import type { Scan } from "../store";
import { remainingBudget, scanReport, type Report } from "./report";

export interface Replan {
  createdAt: string;
  /** What the re-plan was based on. */
  basis: { total: number; real: number; simulated: number; day: number };
  summary: string;
  moves: { from: string; to: string; zone: string | null; amount: number; why: string }[];
  partners: { zone: string; name: string; address: string | null; category: string; affinity: number; role: string; why: string }[];
  watch: string[];
  remaining: number;
  qlooCalls: number;
}

export type AnalystEvent = { type: "analyst-step"; text: string } | { type: "analyst-places"; zone: string; found: number } | { type: "replan"; replan: Replan } | { type: "error"; message: string };

const SYSTEM = `You are the Field Analyst on a launch team. The campaign is running: posters, posts, emails and podcast reads each carry a tracked link, and you can see how many scans each brought. The rehearsal expected each neighbourhood to bring scans in proportion to its share of the launch's natural audience (from Qloo).

Your job: re-plan the budget that hasn't been spent yet.
- Move money from neighbourhoods and actions that are behind to ones that are ahead, or to fix what's behind (new partner places, a different channel). Say why in one sentence, citing the numbers.
- Treat "too early" honestly: when there isn't enough data to call a neighbourhood, keep moves small (at most a tenth of what's left in total) and say they are tests.
- Use find_places for a neighbourhood that is behind to look for new partner places on Qloo whose visitors match the launch's taste; propose only places it returned.
- Scans per dollar so far assume each dollar performs like the average dollar spent so far. Say "heuristic" when you lean on it.
- Never invent numbers. Never describe residents by ethnicity, religion, health or other personal traits.
- Work in parallel when you can, then submit once.`;

export async function runFieldAnalyst(kit: Kit, scans: Scan[], emit: (e: AnalystEvent) => void): Promise<Replan> {
  const report = scanReport(kit, scans);
  const day = report.today;
  const budget = remainingBudget(kit, day);
  const evidence: Evidence[] = [];
  const found = new Map<string, Place & { zone: number }>();
  const partnerNames = new Set(kit.input.partners.map((p) => p.name.toLowerCase()));
  let result: Replan | null = null;
  const safe = (fn: () => Promise<string>) =>
    fn().catch((e) => {
      if (e instanceof RefusalError) throw e;
      return JSON.stringify({ error: (e as Error).message });
    });

  const findPlaces = betaZodTool({
    name: "find_places",
    description: "Search Qloo for places within 1.6 km of a neighbourhood's centre whose visitors match the launch's comparables, excluding current partners and places unsuited to promotion.",
    inputSchema: z.object({ zone_id: z.number().int() }),
    run: ({ zone_id }) =>
      safe(async () => {
        const zone = kit.input.zones.find((x) => x.id === zone_id);
        if (!zone) throw new Error(`Unknown zone ${zone_id}.`);
        if (!kit.input.compIds.length) throw new Error("This campaign has no Qloo comparables to search with.");
        const r = await placesNear(zone.center, 1.6, { entityIds: kit.input.compIds }, { take: 20 });
        evidence.push(r.evidence);
        const spec = { venue: kit.input.venue, constraints: { allAges: kit.input.allAges, noAlcohol: kit.input.noAlcohol, notes: [] } };
        const places = r.places.filter((p) => allowedPartner(p, spec) && !partnerNames.has(p.name.toLowerCase())).slice(0, 6);
        for (const p of places) found.set(p.id, { ...p, zone: zone_id });
        emit({ type: "analyst-places", zone: zone.locality, found: places.length });
        return JSON.stringify({
          zone: zone.locality,
          places: places.map((p) => ({ id: p.id, name: p.name, category: p.categories[0] ?? "", address: p.address ?? null, affinity: Math.round((p.affinity ?? 0) * 100) / 100 })),
        });
      }),
  });

  const submit = betaZodTool({
    name: "submit_replan",
    description: "Submit the re-plan in one call.",
    inputSchema: z.object({
      summary: z.string().describe("Two or three sentences: what the data say and what changes."),
      moves: z
        .array(
          z.object({
            from_step: z.number().int().describe("Index of a plan action with budget left."),
            to: z.string().describe("Where the money goes: an existing action or a new one, e.g. 'Instagram ads in Pilsen'."),
            to_zone_id: z.number().int().nullable(),
            amount: z.number().positive(),
            why: z.string(),
          }),
        )
        .max(6),
      new_partners: z.array(z.object({ place_id: z.string(), role: z.string(), why: z.string() })).max(6),
      watch: z.array(z.string()).max(4).describe("What to check next week."),
    }),
    run: (k) =>
      safe(async () => {
        const problems: string[] = [];
        const fromTotals = new Map<number, number>();
        for (const m of k.moves) {
          const step = budget.byStep[m.from_step];
          if (!step) problems.push(`No action ${m.from_step}.`);
          else fromTotals.set(m.from_step, (fromTotals.get(m.from_step) ?? 0) + m.amount);
          if (m.to_zone_id !== null && !kit.input.zones.some((x) => x.id === m.to_zone_id)) problems.push(`Unknown zone ${m.to_zone_id}.`);
        }
        for (const [i, total] of fromTotals) {
          const step = budget.byStep[i];
          if (step && total > step.remaining + 1) problems.push(`Action ${i} ("${step.label}") has $${step.remaining} left, not $${Math.round(total)}.`);
        }
        const moved = k.moves.reduce((t, m) => t + m.amount, 0);
        const callable = report.zones.some((x) => x.verdict !== "too early");
        if (!callable && moved > budget.remaining * 0.1 + 1)
          problems.push(`Every neighbourhood is "too early" to call; keep moves to $${Math.floor(budget.remaining * 0.1)} or less in total and call them tests.`);
        for (const p of k.new_partners) if (!found.has(p.place_id)) problems.push(`Place ${p.place_id} didn't come from find_places.`);
        if (problems.length) return JSON.stringify({ ok: false, problems });
        const zoneName = (id: number | null) => (id === null ? null : (kit.input.zones.find((x) => x.id === id)?.locality ?? null));
        result = {
          createdAt: new Date().toISOString(),
          basis: { total: report.total, real: report.real, simulated: report.simulated, day },
          summary: k.summary,
          moves: k.moves.map((m) => ({ from: budget.byStep[m.from_step].label, to: m.to, zone: zoneName(m.to_zone_id), amount: Math.round(m.amount), why: m.why })),
          partners: k.new_partners.map((p) => {
            const place = found.get(p.place_id)!;
            return { zone: zoneName(place.zone) ?? "", name: place.name, address: place.address ?? null, category: place.categories[0] ?? "", affinity: place.affinity ?? 0, role: p.role, why: p.why };
          }),
          watch: k.watch,
          remaining: budget.remaining,
          qlooCalls: evidence.filter((e) => !e.cached).length,
        };
        // The re-plan is complete; stop before the agent composes a closing message.
        stop.abort();
        return JSON.stringify({ ok: true });
      }),
  });

  emit({ type: "analyst-step", text: `Reading ${report.total} scans against the rehearsal's expectation, campaign day ${day + 1} of ${kit.input.days}` });
  const stop = new AbortController();
  const runner = claude().beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 12000,
      ...FALLBACK,
      output_config: { effort: "low" },
      max_iterations: 6,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [findPlaces, submit],
      messages: [{ role: "user", content: describe(kit, report, budget, day) }],
    },
    { signal: stop.signal },
  );
  try {
    for await (const message of runner) {
      if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);
      if (result) break;
    }
  } catch (e) {
    // Aborting after the submit is expected; anything else is a real failure.
    if (!result) throw e;
  }
  if (!result) throw new Error("The Field Analyst did not finish. Try again.");
  return result;
}

function describe(kit: Kit, report: Report, budget: ReturnType<typeof remainingBudget>, day: number): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  // Spend so far per neighbourhood: its own actions, plus city-wide actions split by its expected share.
  const spentIn = (zoneId: number, share: number) =>
    kit.input.steps.reduce((t, s, i) => {
      const spent = s.cost - budget.byStep[i].remaining;
      return t + (s.zone === zoneId ? spent : s.zone === null ? spent * share : 0);
    }, 0);
  const zones = report.zones.map((z) => {
    const spent = spentIn(z.zoneId, z.expectedShare);
    const perHundred = spent > 0 ? ((z.observed / spent) * 100).toFixed(1) : "n/a";
    return `- zone ${z.zoneId} ${z.locality} (${z.district}): ${z.observed} scans vs ${z.expected.toFixed(1)} expected (${pct(z.expectedShare)} of the audience); ${z.verdict}${z.z !== null ? `, ${z.z.toFixed(1)} standard errors` : ""}; about $${Math.round(spent)} spent so far, ${perHundred} scans per $100 (heuristic)`;
  });
  const links = [...report.links]
    .sort((a, b) => b.observed - a.observed)
    .slice(0, 12)
    .map((l) => `- ${l.label}: ${l.observed}`);
  const steps = budget.byStep.map((s, i) => `- ${i}: ${s.label}${s.zone !== null ? ` (zone ${s.zone})` : " (city-wide)"}: $${s.remaining} left`);
  return [
    `Launch: ${kit.input.title}. ${kit.input.pitch}`,
    `Today is campaign day ${day + 1} of ${kit.input.days} (launch on day ${kit.input.days}). Budget not yet spent: $${budget.remaining} of $${kit.input.budget}.`,
    `Scans so far: ${report.total} (${report.real} real, ${report.simulated} simulated for a demo; treat them the same). City-wide podcast reads: ${report.cityWide}.`,
    `Neighbourhoods:\n${zones.join("\n")}`,
    `By channel: ${report.channels.map((c) => `${c.channel} ${c.observed}`).join(", ")}.`,
    `Best links:\n${links.join("\n")}`,
    `Plan actions with budget left (index: label: left):\n${steps.join("\n")}`,
    `Comparables: ${kit.input.comps.join(", ")}. ${kit.input.allAges ? "All ages." : ""}${kit.input.noAlcohol ? " No alcohol-led partners." : ""}`,
    `Re-plan the unspent budget and submit.`,
  ].join("\n\n");
}
