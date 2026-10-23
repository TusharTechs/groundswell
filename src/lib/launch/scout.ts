// Scouting: real partner places in each hot zone, and the podcasts and brands
// the launch's natural audience over-indexes on, all from Qloo.

import { toGh6 } from "../atlas/build";
import { distanceKm } from "../atlas/geo";
import type { CityAtlas } from "../atlas/types";
import { heatmap, placesNear, recommend, type Evidence, type Place, type Recommended, type Signals } from "../qloo/entities";
import { plausibleMatch } from "../qloo/names";
import { rawFitFromHeat, type Zone } from "./fit";
import type { LaunchSpec } from "./spec";

export interface Partner extends Place {
  zone: number;
  /** Atlas cell the place sits in. */
  cell: number;
}

export interface MediaOption extends Recommended {
  kind: "podcast";
}

export interface BrandOption extends Recommended {
  kind: "brand";
  /** Per atlas cell, 0–1: where this brand's fans live (Qloo heatmap). */
  heat: number[];
}

// Partners are places where a poster, a flyer drop or a staff mention makes sense.
const PARTNER = /\b(caf[eé]|coffee|tea|bakery|restaurant|taqueria|diner|food|eatery|pizza|burger|bar|pub|brewery|record|music|instrument|book|clothing|boutique|vintage|thrift|consignment|shoe|sneaker|fashion|barber|salon|tattoo|gallery|museum|venue|concert|theat(er|re)|comedy|night ?club|club|cinema|movie|gym|yoga|fitness|climbing|skate|game|comic|market|dessert|ice cream|donut|juice|studio|cowork|community cent|arcade|bowling|lounge|dance|art cent|cultural cent|sports bar)\b/i;
// Never partners: places where promotion would be inappropriate or that aren't open to the public.
const NEVER = /\b(school|academy|college|university|church|mosque|synagogue|temple|place of worship|hospital|clinic|medical|dentist|doctor|pharmacy|government|police|fire station|courthouse|post office|embassy|cemetery|funeral|parking|bus stop|train station|subway|airport|atm|bank|daycare|child care|kindergarten|nursing home|rehab|rental|agency|apartment|hotel|hostel|shelter|ticket office|real estate|storage|car dealer|gas station|arena|stadium|rink|convention|gun|firearm|shooting|weapon|ammunition|casino|strip club|adult|cannabis|dispensary|smoke shop|vape|tobacco|hookah|pawn|bail|check cashing|conference|banquet|wedding|yacht|country club|golf|recording studio|photography studio|office|warehouse|factory|mall|shopping center)\b/i;
const ALCOHOL = /\b(bar|pub|tavern|brewery|brewpub|beer|wine|cocktail|liquor|night ?club|lounge|distillery|taproom|speakeasy)\b/i;

export function allowedPartner(p: Place, spec: Pick<LaunchSpec, "constraints" | "venue">): boolean {
  const cats = [...p.categories, p.name].join(" | ");
  // The launch's own venue is where it happens, not a partner.
  if (spec.venue && plausibleMatch(spec.venue, [p.name])) return false;
  if (NEVER.test(cats)) return false;
  if (!PARTNER.test(p.categories.join(" | "))) return false;
  if (spec.constraints.noAlcohol && ALCOHOL.test(p.categories.join(" | "))) return false;
  return true;
}

export function nearestCell(atlas: CityAtlas, lon: number, lat: number): number {
  let best = 0;
  let bd = Infinity;
  atlas.cells.forEach((c, i) => {
    const d = distanceKm([c.lon, c.lat], [lon, lat]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Up to `perZone` allowed partner places in each zone, strongest Qloo affinity first. */
export async function scoutPartners(atlas: CityAtlas, zones: Zone[], signals: Signals, spec: LaunchSpec, perZone = 4) {
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const partners: Partner[] = [];
  const results = await Promise.all(zones.map((z) => placesNear(z.center, 1.6, signals, { take: 25 })));
  results.forEach((r, k) => {
    evidence.push(r.evidence);
    const zone = zones[k];
    // Qloo's own neighbourhood names for the places are finer than its locality boundaries in some cities.
    const hoods = new Map<string, number>();
    for (const p of r.places) if (p.neighborhood) hoods.set(p.neighborhood, (hoods.get(p.neighborhood) ?? 0) + 1);
    const common = [...hoods.entries()].sort((a, b) => b[1] - a[1])[0];
    if (common && common[1] >= 3) zone.locality = common[0];
    const picked = r.places
      .filter((p) => allowedPartner(p, spec) && !seen.has(p.id))
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, perZone);
    for (const p of picked) {
      seen.add(p.id);
      partners.push({ ...p, zone: zone.id, cell: nearestCell(atlas, p.lon, p.lat) });
    }
  });
  return { partners, evidence };
}

/** Podcasts the audience over-indexes on, and local-leaning brands with where their fans live. */
export async function scoutMedia(atlas: CityAtlas, signals: Signals, opts: { podcasts?: number; brands?: number } = {}) {
  const evidence: Evidence[] = [];
  const [pods, brands] = await Promise.all([
    recommend("podcast", signals, { take: 10, popularityMin: 0.5 }),
    recommend("brand", signals, { take: 10, locationQuery: atlas.city.locationQuery, popularityMin: 0.5 }),
  ]);
  evidence.push(pods.evidence, brands.evidence);
  const podcasts: MediaOption[] = pods.items.slice(0, opts.podcasts ?? 5).map((p) => ({ ...p, kind: "podcast" }));
  const topBrands = brands.items.filter((b) => !signals.entityIds.includes(b.id)).slice(0, opts.brands ?? 3);
  const heats = await Promise.all(topBrands.map((b) => heatmap(atlas.city.center, atlas.city.radiusKm, { entityIds: [b.id] })));
  const brandOptions: BrandOption[] = topBrands.map((b, i) => {
    evidence.push(heats[i].evidence);
    return { ...b, kind: "brand", heat: rawFitFromHeat(atlas, toGh6(heats[i].cells)) };
  });
  return { podcasts, brands: brandOptions, evidence };
}
