// Calibration: run real launches through the model with no promotion, the
// where-people-are benchmark and archetype plans (local seeding, media, mixed),
// and sweep the word-of-mouth parameters across cities.
//
//   npx tsx --env-file=.env scripts/calibrate.ts            # summary at current defaults
//   npx tsx --env-file=.env scripts/calibrate.ts --sweep    # parameter sweep

import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULT_PARAMS, greedyPlan, simulate, type Action, type Params } from "@groundswell/sim";
import { loadAtlas } from "../src/lib/atlas/store";
import { buildMenu, toAction, wherePeopleArePlan, type Selection } from "../src/lib/launch/actions";
import { mapFit } from "../src/lib/launch/fit";
import { scoutMedia, scoutPartners } from "../src/lib/launch/scout";
import { gridOf, paramsFor } from "../src/lib/launch/simulate";
import type { LaunchSpec } from "../src/lib/launch/spec";
import { profileTaste } from "../src/lib/launch/taste";
import { resolveVenue, travelWeights } from "../src/lib/launch/venue";

process.env.QLOO_DISK_CACHE ??= ".cache/qloo";

const SCENARIOS = [
  { city: "chicago", comps: ["Omar Apollo", "Kali Uchis"], venue: "Thalia Hall" },
  { city: "los-angeles", comps: ["Kendrick Lamar", "SZA"], venue: "The Wiltern" },
  { city: "new-york", comps: ["Phoebe Bridgers", "boygenius"], venue: "Brooklyn Steel" },
];

async function prepare(sc: (typeof SCENARIOS)[number]) {
  const atlas = await loadAtlas(sc.city);
  const days = 42;
  const budget = 12000;
  const spec: LaunchSpec = {
    title: "test", kind: "concert", cityId: sc.city, pitch: "", comps: sc.comps.map((name) => ({ name, type: "artist" as const })), age: null, venue: sc.venue, days, budget, capacity: null,
    constraints: { allAges: false, noAlcohol: false, notes: [] }, goal: "attendance",
  };
  const taste = await profileTaste(spec.comps);
  const { venue } = await resolveVenue(sc.venue, atlas);
  const travel = venue ? travelWeights(atlas, venue) : undefined;
  const signals = { entityIds: taste.comps.map((c) => c.id) };
  const fit = await mapFit(atlas, signals, travel);
  const [{ partners }, media] = await Promise.all([scoutPartners(atlas, fit.zones, signals, spec), scoutMedia(atlas, signals)]);
  const ctx = { atlas, fit: fit.fit, zones: fit.zones, partners, podcasts: media.podcasts, brands: media.brands, days, names: new Map(taste.comps.map((c) => [c.id, c.name])) };
  const menu = buildMenu(ctx);
  const byId = new Map(menu.map((c) => [c.id, c]));
  const build = (sels: Selection[]) => sels.flatMap((x) => toAction(x, ctx, byId) ?? []);
  const has = (prefix: string, zone?: number) => menu.filter((c) => c.id.startsWith(prefix) && (zone === undefined || c.zone === zone));
  const [z0, z1] = fit.zones.map((z) => z.id);
  const local: Selection[] = [
    ...has("partner:", z0).map((c) => ({ id: c.id })), ...has("partner:", z1).map((c) => ({ id: c.id })),
    { id: `street:${z0}`, day: 3 }, { id: `street:${z0}`, day: 10 }, { id: `street:${z1}`, day: 6 },
    { id: `social:${z0}`, start: 2, days: 38 }, { id: `social:${z1}`, start: 2, days: 38 },
    ...has("popup:", z0).slice(0, 1).map((c) => ({ id: c.id, day: 28 })),
  ];
  const media_: Selection[] = [...has("podcast:").slice(0, 2).map((c) => ({ id: c.id, day: 1 })), ...has("collab:").slice(0, 1).map((c) => ({ id: c.id, start: 0 })), { id: "social:city", start: 0, days: 20 }];
  const mixed: Selection[] = [
    ...has("partner:", z0).slice(0, 4).map((c) => ({ id: c.id })),
    { id: `street:${z0}`, day: 4 }, { id: `street:${z0}`, day: 12 }, { id: `social:${z0}`, start: 2, days: 30 },
    ...has("podcast:").slice(0, 1).map((c) => ({ id: c.id, day: 14 })), { id: "social:city", start: 18, days: 20 },
    ...has("popup:", z0).slice(0, 1).map((c) => ({ id: c.id, day: 30 })),
  ];
  const plans: [string, Action[]][] = [
    ["none", []],
    ["naive", wherePeopleArePlan(atlas, budget, days)],
    ["local", build(local)],
    ["media", build(media_)],
    ["mixed", build(mixed)],
  ];
  const defaults: Selection[] = menu.flatMap((c): Selection[] => {
    if (c.kind === "street") return [{ id: c.id, day: days - 14 }, { id: c.id, day: days - 28 }];
    if (c.kind === "popup") return [{ id: c.id, day: days - 10 }];
    if (c.kind === "podcast") return [{ id: c.id, day: days - 21 }];
    if (c.kind === "social") return [{ id: c.id, start: days - 28, days: 28 }];
    if (c.kind === "collab") return [{ id: c.id, start: days - 21, days: 14 }];
    return [{ id: c.id }];
  });
  return { sc, atlas, fit, travel, venue, plans, candidates: build(defaults), budget, days, partners, media };
}

async function main() {
  const prepared: Awaited<ReturnType<typeof prepare>>[] = [];
  for (const sc of SCENARIOS) prepared.push(await prepare(sc));
  const row = (p: (typeof prepared)[number], params: Params) =>
    p.plans.map(([name, acts]) => `${name} ${(simulate(gridOf(p.atlas, p.fit.fit, p.travel), acts, params).reach.mean * 100).toFixed(1)}`).join("  ");

  if (process.argv.includes("--sweep")) {
    for (const womExponent of [1.2, 1.35, 1.5]) for (const wom of [0.25, 0.35, 0.5]) for (const buzzHalfLife of [5, 7]) {
      console.log(`k ${womExponent} wom ${wom} hl ${buzzHalfLife}`);
      for (const p of prepared) console.log(`   ${p.sc.city.padEnd(12)} ${row(p, paramsFor(p.days, { runs: 0, womExponent, wom, buzzHalfLife }))}`);
    }
    return;
  }
  console.log(`defaults: wom ${DEFAULT_PARAMS.wom}, k ${DEFAULT_PARAMS.womExponent}, half-life ${DEFAULT_PARAMS.buzzHalfLife}`);
  const saved: { city: string; venue: string | null; zones: string[]; reach: Record<string, number> }[] = [];
  for (const p of prepared) {
    console.log(`\n${p.sc.city}: venue ${p.venue?.name ?? "not found"}; zones ${p.fit.zones.map((z) => `${z.locality} ${(z.audienceShare * 100).toFixed(1)}%`).join(", ")}`);
    console.log(`  partners: ${p.partners.slice(0, 10).map((x) => `${x.name} [${x.categories[0] ?? "?"}]`).join("; ")}`);
    console.log(`  podcasts: ${p.media.podcasts.map((x) => x.name).join("; ")} | brands: ${p.media.brands.map((x) => x.name).join("; ")}`);
    console.log(`  ${row(p, paramsFor(p.days, { runs: 24 }))}`);
    const g = greedyPlan(gridOf(p.atlas, p.fit.fit, p.travel), p.candidates, p.budget, paramsFor(p.days), 20);
    const greedyReach = simulate(gridOf(p.atlas, p.fit.fit, p.travel), g.actions, paramsFor(p.days, { runs: 24 })).reach.mean;
    console.log(`  greedy ${(greedyReach * 100).toFixed(1)} ($${g.cost}): ${g.actions.map((a) => a.label.slice(0, 32)).join(" | ")}`);
    const reach = Object.fromEntries(p.plans.map(([name, acts]) => [name, simulate(gridOf(p.atlas, p.fit.fit, p.travel), acts, paramsFor(p.days, { runs: 24 })).reach.mean]));
    saved.push({ city: p.sc.city, venue: p.venue?.name ?? null, zones: p.fit.zones.map((z) => z.locality ?? ""), reach: { ...reach, optimizer: greedyReach } });
  }
  await mkdir("data/benchmark", { recursive: true });
  await writeFile(
    "data/benchmark/calibration.json",
    JSON.stringify({ runAt: new Date().toISOString(), params: { wom: DEFAULT_PARAMS.wom, womExponent: DEFAULT_PARAMS.womExponent, buzzHalfLife: DEFAULT_PARAMS.buzzHalfLife, baseRate: DEFAULT_PARAMS.baseRate, fitExponent: DEFAULT_PARAMS.fitExponent, audienceShare: DEFAULT_PARAMS.audienceShare }, scenarios: SCENARIOS, rows: saved }, null, 1),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
