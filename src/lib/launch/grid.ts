// The simulation grid for a city and a launch. Pure, so the browser can build
// it for what-if runs.

import type { Grid } from "@groundswell/sim";
import type { CityAtlas } from "../atlas/types";

/**
 * Relative population of each cell. Qloo activity is highest where venues,
 * nightlife and visitors generate data, which would under-count residential
 * neighbourhoods; so every cell gets a floor (people live everywhere) plus a
 * damped share of its activity.
 */
export const massOf = (atlas: CityAtlas) => atlas.cells.map((c) => 0.4 + 0.6 * Math.sqrt(c.activity));

export function gridOf(atlas: CityAtlas, fit: number[], travel?: number[]): Grid {
  return { mass: massOf(atlas), fit, potential: travel, geo: atlas.geo, ties: atlas.ties };
}
