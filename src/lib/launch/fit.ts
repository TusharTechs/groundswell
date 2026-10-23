// Where the launch fits the city: a Qloo heatmap of the comparables' fans,
// laid over the atlas grid, plus hot zones to scout and a per-district summary.

import { naturalAudience, DEFAULT_PARAMS } from "@groundswell/sim";
import { coverageOf, fromBase64, MIN_COVERAGE, toGh6 } from "../atlas/build";
import { distanceKm, type Point } from "../atlas/geo";
import type { CityAtlas } from "../atlas/types";
import { heatmap, type Evidence, type Signals } from "../qloo/entities";
import { massOf } from "./grid";

export { massOf } from "./grid";

export interface Zone {
  id: number;
  /** Weighted centre of the zone's hottest cells. */
  center: [number, number];
  cells: number[];
  /** Mean fit of the zone's cells. */
  fit: number;
  /** Share of the city's natural audience living in the zone. */
  audienceShare: number;
  district: number;
  locality: string | null;
}

export interface FitMap {
  /** Per atlas cell, 0–1: percentile of the cell's Qloo affinity for the comparables (0 where Qloo returned none). */
  fit: number[];
  /** Per atlas cell, 0–1: willingness to travel to the venue, when the launch has one. */
  travel?: number[];
  venue?: { name: string; lon: number; lat: number; address?: string };
  coverage: number;
  zones: Zone[];
  districts: { district: number; meanFit: number; audienceShare: number }[];
  naturalAudience: number;
  evidence: Evidence;
}

/** Percentile of each atlas cell's affinity among the cells Qloo returned. */
export function rawFitFromHeat(atlas: CityAtlas, heat: Map<string, { affinity: number }>): number[] {
  const present = atlas.cells.flatMap((c, i) => {
    const v = heat.get(c.gh);
    return v ? [{ i, a: v.affinity }] : [];
  });
  present.sort((x, y) => x.a - y.a);
  const fit = new Array(atlas.cells.length).fill(0);
  present.forEach((p, rank) => (fit[p.i] = Math.round(((rank + 1) / present.length) * 1000) / 1000));
  return fit;
}

/** Each cell's mean percentile across the atlas's well-covered probes: how strongly it shows up for anything. */
export function baselineOf(atlas: CityAtlas): number[] {
  const n = atlas.cells.length;
  const m = atlas.probes.length;
  const matrix = fromBase64(atlas.vectors);
  const cov = coverageOf(matrix, n, m);
  const used = cov.map((c, p) => (c >= MIN_COVERAGE ? p : -1)).filter((p) => p >= 0);
  return atlas.cells.map((_, i) => used.reduce((s, p) => s + matrix[i * m + p], 0) / Math.max(1, used.length) / 255);
}

/**
 * Fit of each cell for a launch: how far its Qloo heatmap percentile for the
 * launch's comparables sits above what the cell shows for everything (its
 * baseline across all probes), re-ranked to 0–1; cells Qloo didn't return get
 * 0. Busy downtown cells rank high in every Qloo heatmap because that is where
 * the data is, so raw affinity mostly says where people are; this index says
 * where the taste is over-represented. Population (mass) supplies the volume.
 * The cold-start benchmark validates exactly this signal.
 */
export function fitFromHeat(atlas: CityAtlas, heat: Map<string, { affinity: number }>, baseline = baselineOf(atlas)): number[] {
  const raw = rawFitFromHeat(atlas, heat);
  const score = raw.map((r, i) => (r > 0 ? r - baseline[i] : -Infinity));
  const present = score.map((s, i) => ({ s, i })).filter((x) => Number.isFinite(x.s)).sort((a, b) => a.s - b.s);
  const fit = new Array(atlas.cells.length).fill(0);
  present.forEach((p, rank) => (fit[p.i] = Math.round(((rank + 1) / present.length) * 1000) / 1000));
  return fit;
}

function nearestLocality(atlas: CityAtlas, p: [number, number]): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const l of atlas.localities) {
    const d = distanceKm(l.center, p);
    if (d < bd) {
      bd = d;
      best = l.name;
    }
  }
  return best;
}

/** Greedy hot zones: take the strongest cell, gather its cells within `radiusKm`, repeat. */
export function hotZones(atlas: CityAtlas, fit: number[], audience: ArrayLike<number>, count = 5, radiusKm = 1.6): Zone[] {
  const total = Array.from(audience).reduce((s, a) => s + a, 0) || 1;
  const order = atlas.cells.map((_, i) => i).filter((i) => audience[i] > 0).sort((a, b) => audience[b] - audience[a]);
  const taken = new Set<number>();
  const zones: Zone[] = [];
  for (const seed of order) {
    if (zones.length >= count) break;
    if (taken.has(seed)) continue;
    const s: Point = [atlas.cells[seed].lon, atlas.cells[seed].lat];
    // Zones must not overlap: skip seeds too close to an existing zone.
    if (zones.some((z) => distanceKm(z.center, s) < radiusKm * 1.6)) continue;
    const members = atlas.cells.map((c, i) => i).filter((i) => !taken.has(i) && distanceKm([atlas.cells[i].lon, atlas.cells[i].lat], s) <= radiusKm);
    members.forEach((i) => taken.add(i));
    const w = members.reduce((acc, i) => acc + audience[i], 0) || 1;
    const center: [number, number] = [
      members.reduce((acc, i) => acc + atlas.cells[i].lon * audience[i], 0) / w,
      members.reduce((acc, i) => acc + atlas.cells[i].lat * audience[i], 0) / w,
    ];
    const counts = new Map<string, number>();
    for (const i of members) if (atlas.cells[i].locality) counts.set(atlas.cells[i].locality!, (counts.get(atlas.cells[i].locality!) ?? 0) + audience[i]);
    zones.push({
      id: zones.length,
      center: [Math.round(center[0] * 1e5) / 1e5, Math.round(center[1] * 1e5) / 1e5],
      cells: members,
      fit: Math.round((members.reduce((acc, i) => acc + fit[i], 0) / members.length) * 1000) / 1000,
      audienceShare: Math.round((members.reduce((acc, i) => acc + audience[i], 0) / total) * 1000) / 1000,
      district: atlas.cells[seed].district,
      locality: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? atlas.cells[seed].locality ?? nearestLocality(atlas, center),
    });
  }
  return zones;
}

export async function mapFit(atlas: CityAtlas, signals: Signals, travel?: number[], venue?: FitMap["venue"]): Promise<FitMap> {
  const { cells, evidence } = await heatmap(atlas.city.center, atlas.city.radiusKm, signals);
  const fit = fitFromHeat(atlas, toGh6(cells));
  const audience = naturalAudience({ mass: massOf(atlas), fit, potential: travel, geo: atlas.geo, ties: atlas.ties }, DEFAULT_PARAMS);
  const total = audience.reduce((s, a) => s + a, 0) || 1;
  const districts = atlas.districts.map((d) => {
    const idx = atlas.cells.map((c, i) => (c.district === d.id ? i : -1)).filter((i) => i >= 0);
    return {
      district: d.id,
      meanFit: Math.round((idx.reduce((s, i) => s + fit[i], 0) / Math.max(1, idx.length)) * 1000) / 1000,
      audienceShare: Math.round((idx.reduce((s, i) => s + audience[i], 0) / total) * 1000) / 1000,
    };
  });
  return {
    fit,
    travel,
    venue,
    coverage: fit.filter((f) => f > 0).length / fit.length,
    zones: hotZones(atlas, fit, audience),
    districts: districts.sort((a, b) => b.audienceShare - a.audienceShare),
    naturalAudience: total,
    evidence,
  };
}
