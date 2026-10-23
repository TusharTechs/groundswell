// Distance decay for venue launches: the share of a cell's people who would
// travel to the venue, exp(−distance / scale), as in Huff's 1963 gravity model.
// Pure, so the browser can use it for what-if runs.

import { distanceKm } from "../atlas/geo";
import type { CityAtlas } from "../atlas/types";

export const TRAVEL_SCALE_KM = 7;

export function travelWeights(atlas: CityAtlas, venue: { lon: number; lat: number }, scaleKm = TRAVEL_SCALE_KM): number[] {
  return atlas.cells.map((c) => Math.round(Math.exp(-distanceKm([c.lon, c.lat], [venue.lon, venue.lat]) / scaleKm) * 1000) / 1000);
}
