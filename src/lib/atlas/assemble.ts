// Assemble a CityAtlas from probe heatmaps and locality shapes (no I/O).

import type { HeatCell } from "../qloo/entities";
import {
  activityOf,
  assignLocalities,
  buildGrid,
  centerOf,
  clusterDistricts,
  coverageOf,
  DISTRICT_COLORS,
  MIN_COVERAGE,
  districtLift,
  districtProfiles,
  geoNeighbours,
  neighbourhoodShapes,
  percentileMatrix,
  smooth,
  tasteLean,
  tasteTies,
  toBase64,
  toGh6,
} from "./build";
import type { CityDef } from "./cities";
import { centroid } from "./geo";
import type { DistrictBrief } from "./name";
import type { AtlasCell, AtlasProbe, CityAtlas, District } from "./types";

export interface AtlasInputs {
  city: CityDef;
  probes: AtlasProbe[];
  /** One heatmap per probe, same order as `probes`. */
  heats: HeatCell[][];
  localities: { name: string; boundary: string }[];
  qlooCalls: number;
}

export function assembleAtlas(input: AtlasInputs): { atlas: CityAtlas; briefs: DistrictBrief[] } {
  const { city, probes } = input;
  const gh6 = input.heats.map(toGh6);
  const ghs = buildGrid(city.center, city.radiusKm, gh6, 8);
  const n = ghs.length;
  const m = probes.length;
  if (n < 50) throw new Error(`Only ${n} cells for ${city.name}; Qloo returned too little heatmap data.`);

  const matrix = percentileMatrix(ghs, gh6);
  const activity = activityOf(ghs, gh6);
  const coverage = coverageOf(matrix, n, m);
  const lean = tasteLean(matrix, n, m, coverage);
  const geo = geoNeighbours(ghs);
  const smoothed = smooth(lean, n, m, geo, 0.5);
  const { k, labels } = clusterDistricts(smoothed, n, m, activity);
  const profiles = districtProfiles(lean, n, m, labels, k);
  const lift = districtLift(matrix, n, m, labels, k);
  const coords = ghs.map(centerOf);
  const ties = tasteTies(lean, n, m, coords);

  const shapes = neighbourhoodShapes(input.localities, city.name);
  const names = assignLocalities(coords, shapes);

  const cells: AtlasCell[] = ghs.map((gh, i) => ({
    gh,
    lon: Math.round(coords[i][0] * 1e5) / 1e5,
    lat: Math.round(coords[i][1] * 1e5) / 1e5,
    activity: Math.round(activity[i] * 1000) / 1000,
    locality: names[i],
    district: labels[i],
  }));

  const totalActivity = activity.reduce((s, a) => s + a, 0) || 1;
  const districts: District[] = [];
  const briefs: DistrictBrief[] = [];
  for (let c = 0; c < k; c++) {
    const members = cells.map((cell, i) => (cell.district === c ? i : -1)).filter((i) => i >= 0);
    const ranked = probes
      .map((_, p) => ({ probe: p, z: Math.round(profiles[c * m + p] * 100) / 100, lift: Math.round(lift[c * m + p] * 100) / 100 }))
      .filter((r) => coverage[r.probe] >= MIN_COVERAGE)
      .sort((a, b) => b.z - a.z);
    const placeCounts = new Map<string, number>();
    for (const i of members) if (cells[i].locality) placeCounts.set(cells[i].locality!, (placeCounts.get(cells[i].locality!) ?? 0) + 1);
    const places = [...placeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
    const share = members.reduce((s, i) => s + activity[i], 0) / totalActivity;
    // Centre on the busiest cells so the label sits where the district is densest.
    const core = [...members].sort((a, b) => activity[b] - activity[a]).slice(0, Math.max(3, Math.ceil(members.length / 4)));
    const center = centroid([core.map((i) => coords[i])]);
    districts.push({
      id: c,
      name: `District ${c + 1}`,
      blurb: "",
      signature: ranked.slice(0, 6),
      antiSignature: ranked.slice(-4).reverse(),
      places,
      cells: members.length,
      activityShare: Math.round(share * 1000) / 1000,
      center: [Math.round(center[0] * 1e5) / 1e5, Math.round(center[1] * 1e5) / 1e5],
      color: DISTRICT_COLORS[c % DISTRICT_COLORS.length],
    });
    briefs.push({
      id: c,
      over: ranked.slice(0, 6).map((r) => ({ label: probes[r.probe].label, z: r.z, lift: r.lift })),
      under: ranked.slice(-4).reverse().map((r) => ({ label: probes[r.probe].label, z: r.z, lift: r.lift })),
      places,
      share,
    });
  }

  const atlas: CityAtlas = {
    version: 1,
    city,
    builtAt: new Date().toISOString(),
    probes,
    cells,
    vectors: toBase64(matrix),
    districts,
    geo,
    ties,
    localities: shapes.map((s) => {
      const c = centroid(s.rings);
      return { name: s.name, center: [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] };
    }),
    stats: {
      qlooCalls: input.qlooCalls,
      probes: m,
      activeProbes: coverage.filter((c) => c >= MIN_COVERAGE).length,
      cells: n,
      geohashPrecision: [...new Set(input.heats.flatMap((h) => h.slice(0, 50).map((c) => c.geohash.length)))].sort(),
    },
  };
  return { atlas, briefs };
}
