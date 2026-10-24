// "Simulate a week": synthetic scans for demonstrating mission control before
// a campaign has real ones. Scans are drawn around the rehearsal's
// expectation (each neighbourhood in proportion to its share of the natural
// audience), with one neighbourhood deliberately under-performing and one
// over-performing so the Field Analyst has something to find. Every scan made
// here is stored with simulated = true and shown as simulated.

import type { Kit } from "../kit/types";
import type { Scan } from "../store";
import { campaignStart } from "./report";

const DAY_MS = 86_400_000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Relative pull of each channel's link, an assumption for the demo only. */
const CHANNEL_PULL = { poster: 1, instagram: 1.3, tiktok: 1.1, x: 0.45, email: 0.12, podcast: 0.9 } as const;

/** How the demo bends each neighbourhood: one well below expectation, one well above, the rest near it. */
export function demoMultipliers(kit: Kit): Map<number, number> {
  const r = rng(hash(kit.campaignId));
  const ids = kit.input.zones.map((z) => z.id);
  const out = new Map(ids.map((id) => [id, Math.exp((r() - 0.5) * 0.4)]));
  if (ids.length >= 2) {
    const ranked = [...kit.input.zones].sort((a, b) => b.share - a.share);
    out.set(ranked[0].id, 0.55); // the biggest expected zone falls short
    out.set(ranked[ranked.length - 1].id, 1.8); // the smallest one surprises
  }
  return out;
}

/** Scans for campaign days [fromDay, fromDay + 7), at evening-heavy times. */
export function simulateWeek(kit: Kit, fromDay: number): (Omit<Scan, "at"> & { at: string })[] {
  const r = rng(hash(`${kit.campaignId}:${fromDay}`));
  const mult = demoMultipliers(kit);
  const toDay = Math.min(kit.input.days, fromDay + 7);
  if (toDay <= fromDay) return [];
  const shareSum = kit.input.zones.reduce((t, z) => t + z.share, 0) || 1;
  const weights = kit.links.map((l) => {
    if (l.zone === null) return 0.3 * CHANNEL_PULL[l.channel];
    const z = kit.input.zones.find((x) => x.id === l.zone);
    return ((z?.share ?? 0) / shareSum) * (mult.get(l.zone) ?? 1) * CHANNEL_PULL[l.channel];
  });
  const total = weights.reduce((t, w) => t + w, 0);
  const cdf: number[] = [];
  weights.reduce((t, w, i) => (cdf[i] = t + w / total), 0);
  const pick = () => {
    const u = r();
    const i = cdf.findIndex((c) => u <= c);
    return kit.links[i < 0 ? kit.links.length - 1 : i];
  };
  const start = campaignStart(kit).getTime();
  const out: (Omit<Scan, "at"> & { at: string })[] = [];
  for (let day = fromDay; day < toDay; day++) {
    // Interest builds toward launch day.
    const n = Math.round((14 + 26 * (day / Math.max(1, kit.input.days - 1))) * (0.8 + r() * 0.4));
    for (let k = 0; k < n; k++) {
      // Around 7 pm, give or take three hours (Box–Muller).
      const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      const hour = Math.max(8, Math.min(23, Math.round(19 + g * 3)));
      const at = new Date(start + day * DAY_MS - 12 * 3_600_000 + hour * 3_600_000 + Math.floor(r() * 3_600_000));
      out.push({ code: pick().code, country: null, simulated: true, at: at.toISOString() });
    }
  }
  return out;
}
