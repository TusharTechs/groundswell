// Build the Launch Kit's input from a finished rehearsal (pure: runs in the browser).

import type { MediaView, PartnerView, StrategyView } from "../agents/events";
import { cityById } from "../atlas/cities";
import type { CityAtlas } from "../atlas/types";
import type { Candidate } from "../launch/actions";
import type { Zone } from "../launch/fit";
import type { LaunchSpec } from "../launch/spec";
import type { KitInput } from "./types";

const DAY_MS = 86_400_000;

/** Launch day for a brief with `days` to go, counted from `from`. */
export function launchDateFrom(from: Date, days: number) {
  return new Date(from.getTime() + (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function kitInputFrom(args: {
  campaignId: string;
  atlas: CityAtlas;
  spec: LaunchSpec;
  comps: string[];
  compIds: string[];
  peakAge: string | null;
  tags: string[];
  zones: Zone[];
  partners: PartnerView[];
  media: MediaView[];
  candidates: Candidate[];
  strategy: StrategyView;
  launchDate: string;
  launchUrl: string | null;
}): KitInput {
  const { atlas, spec, strategy } = args;
  const days = spec.days;
  const byId = new Map(args.candidates.map((c) => [c.id, c]));
  const before = (d: number | undefined, fallback: number) => Math.max(0, days - 1 - Math.round(d ?? fallback));
  const steps: KitInput["steps"] = strategy.selections.flatMap((sel) => {
    const c = byId.get(sel.id);
    if (!c) return [];
    const cost = strategy.steps.find((s) => s.id === sel.id)?.cost ?? c.cost;
    if (c.timing === "campaign") return [{ kind: c.kind, label: c.label, zone: c.zone ?? null, startDaysBefore: days - 1, endDaysBefore: 0, cost }];
    if (c.timing === "day") {
      const b = before(sel.day, 0);
      return [{ kind: c.kind, label: c.label, zone: c.zone ?? null, startDaysBefore: b, endDaysBefore: b, cost }];
    }
    const start = Math.round(sel.start ?? 0);
    const len = Math.max(1, Math.round(sel.days ?? 14));
    return [{ kind: c.kind, label: c.label, zone: c.zone ?? null, startDaysBefore: before(start, 0), endDaysBefore: before(start + len - 1, 0), cost }];
  });
  const refOf = (id: string) => id.slice(id.indexOf(":") + 1);
  const partnerIds = new Set(strategy.selections.filter((s) => s.id.startsWith("partner:") || s.id.startsWith("popup:")).map((s) => refOf(s.id)));
  const popupDay = new Map(strategy.selections.filter((s) => s.id.startsWith("popup:")).map((s) => [refOf(s.id), before(s.day, 0)]));
  const partners = args.partners.filter((p) => partnerIds.has(p.id));
  const usedZones = new Set([...partners.map((p) => p.zone), ...steps.flatMap((s) => (s.zone !== null ? [s.zone] : []))]);
  const zones = args.zones.filter((z) => usedZones.has(z.id)).slice(0, 5);
  const podcastNames = strategy.selections
    .filter((s) => s.id.startsWith("podcast:"))
    .map((s) => ({ name: args.media.find((m) => m.id === refOf(s.id))?.name ?? "", daysBefore: before(s.day, 0) }))
    .filter((p) => p.name);
  const brands = strategy.selections
    .filter((s) => s.id.startsWith("collab:"))
    .map((s) => ({ name: args.media.find((m) => m.id === refOf(s.id))?.name ?? "" }))
    .filter((b) => b.name);
  return {
    campaignId: args.campaignId,
    cityId: atlas.city.id,
    title: spec.title,
    pitch: spec.pitch,
    kind: spec.kind,
    language: cityById(atlas.city.id)?.language ?? "English",
    venue: spec.venue,
    launchDate: args.launchDate,
    days,
    budget: spec.budget,
    allAges: spec.constraints.allAges,
    noAlcohol: spec.constraints.noAlcohol,
    ageLimit: spec.constraints.allAges ? null : ([spec.pitch, ...spec.constraints.notes].join(" ").match(/\b(1[89]|2[01])\s?\+/)?.[0].replace(/\s/g, "") ?? null),
    launchUrl: args.launchUrl,
    comps: args.comps.slice(0, 4),
    compIds: args.compIds.slice(0, 4),
    peakAge: args.peakAge,
    tags: args.tags.slice(0, 10),
    zones: zones.map((z) => {
      const d = atlas.districts[z.district];
      return {
        id: z.id,
        locality: z.locality ?? `Zone ${z.id + 1}`,
        district: d?.name ?? "",
        signature: (d?.signature ?? [])
          .slice(0, 5)
          .map((s) => atlas.probes[s.probe]?.label ?? "")
          .filter(Boolean),
        share: z.audienceShare,
        center: z.center,
        cells: z.cells.slice(0, 400),
      };
    }),
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      address: p.address ?? null,
      phone: p.phone ?? null,
      website: p.website ?? null,
      role: p.role ?? (popupDay.has(p.id) ? "popup_host" : "poster"),
      why: p.why ?? null,
      zone: p.zone,
      affinity: p.affinity,
      drivers: p.drivers.map((d) => d.name).slice(0, 4),
      lon: p.lon,
      lat: p.lat,
      popupDaysBefore: popupDay.get(p.id) ?? null,
    })),
    podcasts: podcastNames.slice(0, 3),
    brands: brands.slice(0, 2),
    steps: steps.slice(0, 60),
  };
}
