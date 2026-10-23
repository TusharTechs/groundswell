// The venue, when a launch happens at one place: people are less likely to
// travel the further they live from it (distance decay, as in Huff's 1963
// gravity model of where people shop).

import type { CityAtlas } from "../atlas/types";
import { qlooGet } from "../qloo/client";
import { plausibleMatch } from "../qloo/names";
import { evidenceOf, type Evidence, type RawEntity } from "../qloo/entities";

export interface Venue {
  id: string;
  name: string;
  lon: number;
  lat: number;
  address?: string;
}

/** Find the venue on Qloo near the city centre. */
export async function resolveVenue(name: string, atlas: CityAtlas): Promise<{ venue: Venue | null; evidence: Evidence }> {
  const [lon, lat] = atlas.city.center;
  const call = await qlooGet<{ results?: RawEntity[] }>("/search", {
    query: name,
    types: "urn:entity:place",
    "filter.location": `${lat},${lon}`,
    "filter.radius": Math.min(100, Math.round(atlas.city.radiusKm * 1.5)),
    take: 5,
  });
  const hit = (call.data.results ?? []).find((e) => plausibleMatch(name, [e.name]) && typeof e.location?.lat === "number");
  const venue = hit
    ? { id: hit.entity_id, name: hit.name, lon: hit.location!.lon!, lat: hit.location!.lat!, address: (hit.properties as { address?: string } | undefined)?.address }
    : null;
  return { venue, evidence: evidenceOf(call) };
}

export { TRAVEL_SCALE_KM, travelWeights } from "./travel";
