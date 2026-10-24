// What the home page shows from the recorded showcases: each one's result,
// its first poster, and for the featured one, the plans it rehearsed, a kit
// excerpt and a simulated week in mission control. Read from data/ at build.

import { loadAtlas } from "./atlas/store";
import { scanReport } from "./campaign/report";
import { simulateWeek } from "./campaign/simulate";
import { loadKit } from "./kit/load";
import { posterPath } from "./kit/poster";
import type { Kit } from "./kit/types";
import { loadShowcase, showcaseSummaries, type ShowcaseSummary } from "./showcase";
import type { Scan } from "./store";

export const siteOrigin = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export interface ShowcaseCard extends ShowcaseSummary {
  poster?: string;
  hasKit: boolean;
}

async function posterFor(kit: Kit): Promise<string | undefined> {
  const zone = kit.zones[0];
  if (!zone) return undefined;
  const atlas = await loadAtlas(kit.input.cityId).catch(() => null);
  const meta = kit.input.zones.find((z) => z.id === zone.zoneId);
  const color = atlas?.districts.find((d) => d.name === meta?.district)?.color;
  const i = kit.input.partners.findIndex((p) => p.zone === zone.zoneId);
  return posterPath(kit, kit.input, zone.zoneId, { origin: siteOrigin(), partner: i >= 0 ? kit.input.partners[i] : undefined, code: i >= 0 ? `p${i + 1}` : undefined, color, demo: true });
}

export async function showcaseCards(): Promise<ShowcaseCard[]> {
  const summaries = await showcaseSummaries();
  return Promise.all(
    summaries.map(async (s) => {
      const kit = await loadKit(s.id);
      return { ...s, hasKit: Boolean(kit), poster: kit ? await posterFor(kit) : undefined };
    }),
  );
}

export interface Loop {
  id: string;
  title: string;
  city: string;
  plans: { id: string; name: string; reach: number; chosen: boolean }[];
  benchmark: number;
  kit: { zone: string; poster?: string; instagram: string; references: { name: string; verdict: string }[] } | null;
  week: { locality: string; observed: number; expected: number; verdict: string }[];
  weekTotal: number;
}

/** The featured showcase, end to end: rehearse, launch, steer. */
export async function campaignLoop(id: string): Promise<Loop | null> {
  const run = await loadShowcase(id);
  const kit = await loadKit(id);
  if (!run || !kit) return null;
  const sims = new Map<string, number>();
  const names = new Map<string, string>();
  let benchmark = 0;
  let chosen = "";
  for (const { e } of run.events) {
    if (e.type === "strategies") for (const s of e.strategies) names.set(s.id, s.name);
    else if (e.type === "sim") for (const r of e.results) sims.set(r.strategyId, r.metrics.reach.mean);
    else if (e.type === "baseline") benchmark = e.sim.metrics.reach.mean;
    else if (e.type === "plan") {
      chosen = e.plan.strategyId;
      sims.set(chosen, e.sim.metrics.reach.mean);
    }
  }
  const plans = [...sims.entries()].map(([pid, reach]) => ({ id: pid, name: names.get(pid) ?? pid, reach, chosen: pid === chosen })).sort((a, b) => b.reach - a.reach);
  // Prefer the neighbourhood whose copy leans on a reference Qloo called strong there.
  const zone = kit.zones.find((z) => z.references.some((r) => r.verdict === "strong here")) ?? kit.zones[0];
  const meta = zone ? kit.input.zones.find((z) => z.id === zone.zoneId) : undefined;
  const scans: Scan[] = simulateWeek(kit, 0);
  const report = scanReport(kit, scans);
  return {
    id,
    title: kit.input.title,
    city: run.cityId,
    plans,
    benchmark,
    kit: zone
      ? {
          zone: meta?.locality ?? "",
          poster: await posterFor({ ...kit, zones: [zone, ...kit.zones.filter((z) => z !== zone)] }),
          instagram: zone.instagram.replaceAll("{link}", "[tracked link]").trim(),
          references: zone.references.map((r) => ({ name: r.name, verdict: r.verdict })),
        }
      : null,
    week: report.zones.map((z) => ({ locality: z.locality, observed: z.observed, expected: z.expected, verdict: z.verdict })),
    weekTotal: report.total,
  };
}
