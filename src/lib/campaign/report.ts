// Mission control's numbers: tracked-link scans against what the rehearsal
// expects. Each neighbourhood is expected to bring scans in proportion to its
// share of the natural audience (from the Qloo fit map); a gap counts as clear
// only when it is about two standard errors or more. Pure: runs in the browser.

import { dateBefore } from "../kit/build";
import type { Kit, TrackedLink } from "../kit/types";
import type { Scan } from "../store";

const DAY_MS = 86_400_000;

/** Campaign day 0 is `days - 1` days before launch day. */
export function campaignStart(kit: Pick<Kit, "input">): Date {
  return dateBefore(kit.input.launchDate, kit.input.days - 1);
}

/** Which campaign day a moment falls on (0-based, clamped to the campaign). */
export function campaignDay(kit: Pick<Kit, "input">, at: Date): number {
  const d = Math.floor((at.getTime() - campaignStart(kit).getTime() + DAY_MS / 2) / DAY_MS);
  return Math.max(0, Math.min(kit.input.days - 1, d));
}

export type Verdict = "ahead" | "behind" | "on track" | "too early";

export interface ZoneReport {
  zoneId: number;
  locality: string;
  district: string;
  /** Share of the natural audience the rehearsal puts in this zone, among the plan's zones. */
  expectedShare: number;
  observed: number;
  expected: number;
  /** Observed ÷ expected. */
  ratio: number | null;
  /** Standard errors between observed and expected. */
  z: number | null;
  verdict: Verdict;
}

export interface LinkReport extends TrackedLink {
  observed: number;
}

export interface Report {
  total: number;
  real: number;
  simulated: number;
  /** Scans not tied to a neighbourhood (city-wide podcast reads). */
  cityWide: number;
  zones: ZoneReport[];
  channels: { channel: TrackedLink["channel"]; observed: number }[];
  links: LinkReport[];
  byDay: { day: number; real: number; simulated: number }[];
  /** The latest campaign day with scans; mission control's "today". */
  today: number;
}

export function verdictOf(observed: number, expected: number, total: number, share: number): { z: number | null; verdict: Verdict } {
  if (total < 30 || expected < 5) return { z: null, verdict: "too early" };
  const sd = Math.sqrt(total * share * (1 - share));
  const z = sd > 0 ? (observed - expected) / sd : 0;
  return { z, verdict: z >= 2 ? "ahead" : z <= -2 ? "behind" : "on track" };
}

export function scanReport(kit: Kit, scans: Scan[]): Report {
  const byCode = new Map(kit.links.map((l) => [l.code, l]));
  const valid = scans.filter((s) => byCode.has(s.code));
  const zoneScans = new Map<number, number>();
  let cityWide = 0;
  const linkCount = new Map<string, number>();
  const days = new Map<number, { real: number; simulated: number }>();
  for (const s of valid) {
    const link = byCode.get(s.code)!;
    linkCount.set(s.code, (linkCount.get(s.code) ?? 0) + 1);
    if (link.zone === null) cityWide++;
    else zoneScans.set(link.zone, (zoneScans.get(link.zone) ?? 0) + 1);
    const day = campaignDay(kit, new Date(s.at));
    const d = days.get(day) ?? { real: 0, simulated: 0 };
    d[s.simulated ? "simulated" : "real"]++;
    days.set(day, d);
  }
  const inZones = valid.length - cityWide;
  const shareSum = kit.input.zones.reduce((t, z) => t + z.share, 0) || 1;
  const zones = kit.input.zones.map((z): ZoneReport => {
    const share = z.share / shareSum;
    const observed = zoneScans.get(z.id) ?? 0;
    const expected = inZones * share;
    const { z: zScore, verdict } = verdictOf(observed, expected, inZones, share);
    return { zoneId: z.id, locality: z.locality, district: z.district, expectedShare: share, observed, expected, ratio: expected > 0 ? observed / expected : null, z: zScore, verdict };
  });
  const channels = (["poster", "instagram", "tiktok", "x", "podcast", "email"] as const)
    .map((channel) => ({ channel, observed: valid.filter((s) => byCode.get(s.code)!.channel === channel).length }))
    .filter((c) => kit.links.some((l) => l.channel === c.channel));
  const byDay = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, ...v }));
  return {
    total: valid.length,
    real: valid.filter((s) => !s.simulated).length,
    simulated: valid.filter((s) => s.simulated).length,
    cityWide,
    zones,
    channels,
    links: kit.links.map((l) => ({ ...l, observed: linkCount.get(l.code) ?? 0 })),
    byDay,
    today: byDay.length ? byDay[byDay.length - 1].day : 0,
  };
}

/**
 * Budget not yet spent on campaign day `day`: actions that haven't started
 * count in full, running ones by the share of their days still to come (spend
 * is assumed even across an action's days), finished ones not at all.
 */
export function remainingBudget(kit: Pick<Kit, "input">, day: number): { remaining: number; byStep: { label: string; kind: string; zone: number | null; remaining: number }[] } {
  const daysBefore = kit.input.days - 1 - day;
  const byStep = kit.input.steps.map((s) => {
    let left = 0;
    if (daysBefore > s.startDaysBefore) left = s.cost;
    else if (daysBefore >= s.endDaysBefore) left = (s.cost * (daysBefore - s.endDaysBefore)) / (s.startDaysBefore - s.endDaysBefore + 1);
    return { label: s.label, kind: s.kind, zone: s.zone, remaining: Math.round(left) };
  });
  return { remaining: byStep.reduce((t, s) => t + s.remaining, 0), byStep };
}
