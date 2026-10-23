// The venue, when a launch happens at one place: people are less likely to
// travel the further they live from it (distance decay, as in Huff's 1963
// gravity model of where people shop).

import type { CityAtlas } from "../atlas/types";
import { qlooGet } from "../qloo/client";
import { normName, plausibleMatch } from "../qloo/names";
import { evidenceOf, type Evidence, type RawEntity } from "../qloo/entities";

export interface Venue {
  id: string;
  name: string;
  lon: number;
  lat: number;
  address?: string;
}

/** Name variants to try: briefs often say "The Tabernacle, Atlanta" or "Nitehawk Cinema in Williamsburg". */
export function venueQueries(name: string): string[] {
  const base = name.split(/,| in | at /i)[0].trim();
  const variants = [name.trim(), base, base.replace(/^the\s+/i, "")];
  return [...new Set(variants.filter((v) => v.length >= 3))];
}

/**
 * Find the venue: a neighbourhood the atlas knows ("a pop-up in Roma Norte"),
 * else a place on Qloo near the city centre.
 */
export async function resolveVenue(name: string, atlas: CityAtlas): Promise<{ venue: Venue | null; evidence: Evidence | null }> {
  const area = venueQueries(name)
    .map((q) => atlas.localities.find((l) => normName(l.name).replace(/^colonia /, "") === normName(q)))
    .find(Boolean);
  if (area) return { venue: { id: `locality:${area.name}`, name: area.name, lon: area.center[0], lat: area.center[1] }, evidence: null };
  const [lon, lat] = atlas.city.center;
  let evidence: Evidence | null = null;
  for (const q of venueQueries(name)) {
    const call = await qlooGet<{ results?: RawEntity[] }>("/search", {
      query: q,
      types: "urn:entity:place",
      "filter.location": `${lat},${lon}`,
      "filter.radius": Math.min(100, Math.round(atlas.city.radiusKm * 1.5)),
      take: 5,
    });
    evidence = evidenceOf(call);
    // A venue may add one word ("Nitehawk Cinema Williamsburg") but not become a different place
    // ("Roma Norte" is a neighbourhood, not "Vecchio Forno - Roma Norte").
    const words = (x: string) => normName(x).split(" ").filter(Boolean).length;
    const hit = (call.data.results ?? []).find((e) => plausibleMatch(q, [e.name]) && words(e.name) - words(q) <= 1 && typeof e.location?.lat === "number");
    if (hit) {
      const venue = { id: hit.entity_id, name: hit.name, lon: hit.location!.lon!, lat: hit.location!.lat!, address: (hit.properties as { address?: string } | undefined)?.address };
      return { venue, evidence };
    }
  }
  return { venue: null, evidence };
}

export { TRAVEL_SCALE_KM, travelWeights } from "./travel";
