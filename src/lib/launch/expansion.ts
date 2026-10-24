// Where next: the same launch in Groundswell's other cities. For each city,
// one Qloo heatmap of the comparables gives
//   presence   how much of the city Qloo sees this taste in (the share of cells
//              it returns), divided by the median for the atlas probes there:
//              above 1 means this taste shows up more widely than a typical one
//   where      the neighbourhoods where it is most over-represented (the same
//              index the simulator uses), weighted by population
// Raw Qloo affinity is relative within each response, so it isn't compared
// across cities; presence and the within-city index are.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coverageOf, fromBase64, toGh6 } from "../atlas/build";
import { CITIES } from "../atlas/cities";
import { loadAtlas } from "../atlas/store";
import type { CityAtlas } from "../atlas/types";
import { heatmap, type Evidence } from "../qloo/entities";
import { fitFromHeat, rawFitFromHeat } from "./fit";
import { massOf } from "./grid";

export interface CityProspect {
  cityId: string;
  city: string;
  /** Share of the city's cells where Qloo returns this taste. */
  coverage: number;
  /** coverage ÷ the median probe coverage in that city. */
  presence: number;
  /** Neighbourhoods holding the most of the launch's natural audience there. */
  places: string[];
  /** The district holding the largest share of that audience. */
  district: { id: number; name: string; share: number };
  /** That city's closest taste match to the launch's home district, from the atlas twins. */
  twin: { id: number; name: string; similarity: number } | null;
}

type Twins = { from: { city: string; district: number }; to: { city: string; district: number; similarity: number }[] }[];

function medianProbeCoverage(atlas: CityAtlas) {
  const cov = coverageOf(fromBase64(atlas.vectors), atlas.cells.length, atlas.probes.length).sort((a, b) => a - b);
  return cov[Math.floor(cov.length / 2)] || 1;
}

function prospect(atlas: CityAtlas, heat: Map<string, { affinity: number }>, twin: CityProspect["twin"]): CityProspect {
  const raw = rawFitFromHeat(atlas, heat);
  const coverage = raw.filter((f) => f > 0).length / raw.length;
  const fit = fitFromHeat(atlas, heat);
  const mass = massOf(atlas);
  const audience = fit.map((f, i) => mass[i] * f ** 3);
  const total = audience.reduce((s, a) => s + a, 0) || 1;
  const byPlace = new Map<string, number>();
  const byDistrict = new Map<number, number>();
  atlas.cells.forEach((c, i) => {
    if (c.locality) byPlace.set(c.locality, (byPlace.get(c.locality) ?? 0) + audience[i]);
    byDistrict.set(c.district, (byDistrict.get(c.district) ?? 0) + audience[i]);
  });
  const [bestDistrict, share] = [...byDistrict.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  return {
    cityId: atlas.city.id,
    city: atlas.city.name,
    coverage: Math.round(coverage * 1000) / 1000,
    presence: Math.round((coverage / medianProbeCoverage(atlas)) * 100) / 100,
    places: [...byPlace.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p),
    district: { id: bestDistrict, name: atlas.districts[bestDistrict]?.name ?? "", share: Math.round((share / total) * 1000) / 1000 },
    twin,
  };
}

/** The other cities, strongest presence first. `homeDistrict` is the district holding most of the audience at home. */
export async function scoutExpansion(homeCityId: string, compIds: string[], homeDistrict: number) {
  const twins: Twins = JSON.parse(await readFile(join(process.cwd(), "data", "atlas", "twins.json"), "utf8").catch(() => "[]"));
  const row = twins.find((t) => t.from.city === homeCityId && t.from.district === homeDistrict);
  const others = CITIES.filter((c) => c.id !== homeCityId);
  const evidence: Evidence[] = [];
  const prospects = await Promise.all(
    others.map(async (c) => {
      const atlas = await loadAtlas(c.id);
      const r = await heatmap(atlas.city.center, atlas.city.radiusKm, { entityIds: compIds });
      evidence.push(r.evidence);
      const t = row?.to.find((x) => x.city === c.id);
      const twin = t ? { id: t.district, name: atlas.districts[t.district]?.name ?? "", similarity: t.similarity } : null;
      return prospect(atlas, toGh6(r.cells), twin);
    }),
  );
  return { prospects: prospects.sort((a, b) => b.presence - a.presence), evidence };
}
