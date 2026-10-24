// The action menu: what a launch team can do, built from what Qloo scouted,
// and how each action raises awareness in the simulation. Costs and effects
// are stated assumptions, shown in the product and editable in one place.

import type { Action, Effect } from "@groundswell/sim";
import { distanceKm } from "../atlas/geo";
import type { CityAtlas } from "../atlas/types";
import type { Zone } from "./fit";
import type { BrandOption, MediaOption, Partner } from "./scout";

export type ActionKind = "partner" | "popup" | "street" | "podcast" | "social" | "collab";

export const ASSUMPTIONS = {
  partner: {
    cost: 300,
    rate: 0.004,
    spill: 0.4,
    note: "Posters, a flyer or ticket drop and staff mentions at a partner place for the whole campaign. Reaches the place's cell and, at 40%, the cells around it.",
  },
  popup: {
    cost: 2500,
    rate: 0.1,
    spill: 0.5,
    buzzRate: 0.0015,
    buzzDays: 4,
    note: "A launch party or pop-up at a partner place on one day. Strong locally; for four days after, word reaches people with matching taste across the city.",
  },
  street: { costPerDay: 450, rate: 0.03, note: "A street team in a hot zone for one day, weighted toward the zone's best-fitting cells." },
  podcast: {
    baseCost: 700,
    popularityCost: 2800,
    rate: 0.12,
    tailRate: 0.02,
    tailDays: 3,
    note: "A host-read ad. Roughly 5–15% of the natural audience hears a show they over-index on (more for a closer fit); about one in eight who hear it on air day become interested, fewer over the next three days. Bigger shows cost more.",
  },
  social: {
    costPerDayZone: 60,
    costPerDayCity: 180,
    rate: 0.0012,
    zoneRate: 0.0018,
    broad: 0.35,
    note: "Interest-targeted social ads, weighted by fit, in one hot zone or across the city. Untargeted ads reach a potential adopter about a third as often for the same spend.",
  },
  collab: {
    cost: 2000,
    rate: 0.0015,
    days: 14,
    note: "A co-branded drop for two weeks with a brand the audience over-indexes on, reaching cells where that brand's fans live.",
  },
} as const;

/** Share of the natural audience that listens to a podcast, from how strongly the audience over-indexes on it. */
export const listenShare = (affinity: number) => 0.04 + 0.1 * affinity ** 8;

export interface Candidate {
  id: string;
  kind: ActionKind;
  label: string;
  /** Why it is on the menu, from Qloo. */
  why: string;
  /** Flat cost, or cost per day for street and social. */
  cost: number;
  timing: "campaign" | "day" | "span";
  where?: [number, number];
  zone?: number;
}

export interface Selection {
  id: string;
  /** For day actions (popup, street, podcast): the 0-based campaign day. */
  day?: number;
  /** For span actions (social, collab): first day and length. */
  start?: number;
  days?: number;
}

export interface MenuContext {
  atlas: CityAtlas;
  fit: number[];
  zones: Zone[];
  partners: Partner[];
  podcasts: MediaOption[];
  brands: BrandOption[];
  days: number;
  names: Map<string, string>;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const podcastCost = (p: MediaOption) => Math.round((ASSUMPTIONS.podcast.baseCost + ASSUMPTIONS.podcast.popularityCost * (p.popularity ?? 0.5)) / 50) * 50;

function driverText(drivers: { id: string; share: number }[], names: Map<string, string>) {
  const named = drivers.map((d) => ({ name: names.get(d.id), share: d.share })).filter((d) => d.name);
  if (!named.length) return "";
  return ` Pulled in by ${named.slice(0, 2).map((d) => `${d.name} (${pct(d.share)})`).join(" and ")}.`;
}

export function buildMenu(ctx: MenuContext): Candidate[] {
  const zoneName = (z: number) => ctx.zones.find((x) => x.id === z)?.locality ?? `zone ${z + 1}`;
  const out: Candidate[] = [];
  for (const p of ctx.partners) {
    const cat = p.categories[0] ?? "Place";
    out.push({
      id: `partner:${p.id}`,
      kind: "partner",
      label: `${p.name} (${cat}), ${zoneName(p.zone)}`,
      why: `${p.why ? `${p.why} ` : ""}Qloo affinity ${p.affinity.toFixed(2)} with this crowd.${driverText(p.drivers, ctx.names)}`,
      cost: ASSUMPTIONS.partner.cost,
      timing: "campaign",
      where: [p.lon, p.lat],
      zone: p.zone,
    });
  }
  for (const p of ctx.partners.filter((x) => /venue|music|club|gallery|museum|theater|theatre|hall|bar|cafe|coffee|restaurant|park|market|store|shop/i.test(x.categories.join(" ")))) {
    out.push({
      id: `popup:${p.id}`,
      kind: "popup",
      label: `Launch party or pop-up at ${p.name}, ${zoneName(p.zone)}`,
      why: `A one-day event where this crowd already goes (Qloo affinity ${p.affinity.toFixed(2)}).`,
      cost: ASSUMPTIONS.popup.cost,
      timing: "day",
      where: [p.lon, p.lat],
      zone: p.zone,
    });
  }
  for (const z of ctx.zones) {
    out.push({
      id: `street:${z.id}`,
      kind: "street",
      label: `Street team day in ${zoneName(z.id)}`,
      why: `${pct(z.audienceShare)} of the city's natural audience lives in this zone (mean fit ${z.fit.toFixed(2)}).`,
      cost: ASSUMPTIONS.street.costPerDay,
      timing: "day",
      where: z.center,
      zone: z.id,
    });
    out.push({
      id: `social:${z.id}`,
      kind: "social",
      label: `Targeted social ads in ${zoneName(z.id)}`,
      why: `Interest-targeted ads in a zone holding ${pct(z.audienceShare)} of the natural audience.`,
      cost: ASSUMPTIONS.social.costPerDayZone,
      timing: "span",
      where: z.center,
      zone: z.id,
    });
  }
  out.push({
    id: "social:city",
    kind: "social",
    label: `Targeted social ads across ${ctx.atlas.city.name}`,
    why: "Interest-targeted ads everywhere, weighted by how well each cell fits.",
    cost: ASSUMPTIONS.social.costPerDayCity,
    timing: "span",
  });
  for (const p of ctx.podcasts) {
    out.push({
      id: `podcast:${p.id}`,
      kind: "podcast",
      label: `Host-read ad on ${p.name}`,
      why: `This audience over-indexes on the show (Qloo affinity ${p.affinity.toFixed(2)}).${driverText(p.drivers, ctx.names)}`,
      cost: podcastCost(p),
      timing: "day",
    });
  }
  for (const b of ctx.brands) {
    out.push({
      id: `collab:${b.id}`,
      kind: "collab",
      label: `Co-branded drop with ${b.name}`,
      why: `A brand this audience over-indexes on in ${ctx.atlas.city.name} (Qloo affinity ${b.affinity.toFixed(2)}).`,
      cost: ASSUMPTIONS.collab.cost,
      timing: "span",
    });
  }
  return out;
}

const clampDay = (d: number | undefined, days: number, fallback: number) => Math.max(0, Math.min(days - 1, Math.round(d ?? fallback)));

/** Cost of a selection: flat, or per day for street (one day) and social (its span). */
export function selectionCost(c: Candidate, s: Selection, days: number): number {
  if (c.kind === "social") return c.cost * spanOf(s, days).length;
  return c.cost;
}

function spanOf(s: Selection, days: number, defaultLength = 14) {
  const start = clampDay(s.start, days, Math.max(0, days - defaultLength));
  const length = Math.max(1, Math.min(days - start, Math.round(s.days ?? defaultLength)));
  return { start, length, end: start + length - 1 };
}

function withNeighbours(atlas: CityAtlas, cell: number, spill: number) {
  return [{ index: cell, weight: 1 }, ...atlas.geo[cell].map((j) => ({ index: j, weight: spill }))];
}

/** Turn a selection from the menu into a simulation action. */
export function toAction(s: Selection, ctx: MenuContext, menu: Map<string, Candidate>): Action | null {
  const c = menu.get(s.id);
  if (!c) return null;
  const { atlas, fit, days } = ctx;
  const n = atlas.cells.length;
  const A = ASSUMPTIONS;
  const effects: Effect[] = [];
  const [kind, ref] = [c.kind, c.id.slice(c.id.indexOf(":") + 1)];
  if (kind === "partner" || kind === "popup") {
    const p = ctx.partners.find((x) => x.id === ref);
    if (!p) return null;
    if (kind === "partner") {
      effects.push({ kind: "local", cells: withNeighbours(atlas, p.cell, A.partner.spill), rate: A.partner.rate, from: 0, to: days - 1 });
    } else {
      const day = clampDay(s.day, days, days - 10);
      effects.push({ kind: "local", cells: withNeighbours(atlas, p.cell, A.popup.spill), rate: A.popup.rate, from: day, to: day });
      effects.push({ kind: "broadcast", weights: fit.map((f) => f * 0.25), rate: A.popup.buzzRate, from: day + 1, to: Math.min(days - 1, day + A.popup.buzzDays) });
    }
  } else if (kind === "street") {
    const z = ctx.zones.find((x) => x.id === Number(ref));
    if (!z) return null;
    const day = clampDay(s.day, days, days - 14);
    const max = Math.max(...z.cells.map((i) => fit[i]), 1e-9);
    effects.push({ kind: "local", cells: z.cells.map((i) => ({ index: i, weight: fit[i] / max })), rate: A.street.rate, from: day, to: day });
  } else if (kind === "social") {
    const span = spanOf(s, days);
    let weights: number[];
    if (ref === "city") weights = fit;
    else {
      const z = ctx.zones.find((x) => x.id === Number(ref));
      if (!z) return null;
      const inZone = new Set(z.cells);
      weights = fit.map((f, i) => (inZone.has(i) ? f : 0));
    }
    effects.push({ kind: "broadcast", weights, rate: ref === "city" ? A.social.rate : A.social.zoneRate, from: span.start, to: span.end });
  } else if (kind === "podcast") {
    const p = ctx.podcasts.find((x) => x.id === ref);
    if (!p) return null;
    const day = clampDay(s.day, days, days - 21);
    const share = listenShare(p.affinity);
    const weights = fit.map((f) => f * share);
    effects.push({ kind: "broadcast", weights, rate: A.podcast.rate, from: day, to: day });
    effects.push({ kind: "broadcast", weights, rate: A.podcast.tailRate, from: day + 1, to: Math.min(days - 1, day + A.podcast.tailDays) });
  } else if (kind === "collab") {
    const b = ctx.brands.find((x) => x.id === ref);
    if (!b) return null;
    const span = spanOf({ ...s, days: s.days ?? A.collab.days }, days, A.collab.days);
    effects.push({ kind: "broadcast", weights: fit.map((f, i) => f * (b.heat[i] ?? 0)), rate: A.collab.rate, from: span.start, to: span.end });
  }
  if (!effects.length || effects.some((e) => e.kind === "local" && !e.cells.every((x) => x.index < n))) return null;
  const key = [s.id, s.day, s.start, s.days].filter((x) => x !== undefined).join("@");
  return { id: key, label: c.label, cost: selectionCost(c, s, days), effects };
}

/**
 * The comparison plan a team without taste data would run with the same
 * budget: broad (untargeted) social ads, street teams in the busiest areas,
 * and a pop-up downtown. Every effect is placed by activity, not by taste.
 */
export function wherePeopleArePlan(atlas: CityAtlas, budget: number, days: number): Action[] {
  const n = atlas.cells.length;
  const byActivity = atlas.cells.map((_, i) => i).sort((a, b) => atlas.cells[b].activity - atlas.cells[a].activity);
  const A = ASSUMPTIONS;
  const actions: Action[] = [];
  let left = budget;
  // A pop-up at the busiest cell, two weeks before launch.
  if (left >= A.popup.cost * 2) {
    const cell = byActivity[0];
    const day = Math.max(0, days - 14);
    actions.push({
      id: "naive:popup",
      label: "Pop-up at the busiest spot downtown",
      cost: A.popup.cost,
      effects: [
        { kind: "local", cells: withNeighbours(atlas, cell, A.popup.spill), rate: A.popup.rate, from: day, to: day },
        { kind: "broadcast", weights: new Array(n).fill(0.25), rate: A.popup.buzzRate, from: day + 1, to: Math.min(days - 1, day + A.popup.buzzDays) },
      ],
    });
    left -= A.popup.cost;
  }
  // Street teams in the three busiest areas (at least 2 km apart), two days each.
  const busy: number[] = [];
  for (const i of byActivity) {
    if (busy.length === 3) break;
    if (busy.every((j) => distanceKm([atlas.cells[i].lon, atlas.cells[i].lat], [atlas.cells[j].lon, atlas.cells[j].lat]) >= 2)) busy.push(i);
  }
  const streetBudget = Math.min(left * 0.4, A.street.costPerDay * 2 * busy.length);
  const streetDays = Math.floor(streetBudget / A.street.costPerDay);
  for (let k = 0; k < streetDays; k++) {
    const seed = busy[Math.floor(k / 2) % busy.length];
    const cells = [seed, ...atlas.geo[seed]];
    const day = Math.max(0, days - 21 + k * 3);
    actions.push({ id: `naive:street${k}`, label: "Street team in a busy area", cost: A.street.costPerDay, effects: [{ kind: "local", cells: cells.map((i) => ({ index: i, weight: 1 })), rate: A.street.rate, from: day, to: day }] });
    left -= A.street.costPerDay;
  }
  // The rest on broad social ads across the city, as long as the budget allows.
  const socialDays = Math.min(days, Math.floor(left / A.social.costPerDayCity));
  if (socialDays > 0) {
    actions.push({
      id: "naive:social",
      label: "Broad social ads across the city",
      cost: socialDays * A.social.costPerDayCity,
      effects: [{ kind: "broadcast", weights: new Array(n).fill(A.social.broad), rate: A.social.rate, from: days - socialDays, to: days - 1 }],
    });
  }
  return actions;
}
