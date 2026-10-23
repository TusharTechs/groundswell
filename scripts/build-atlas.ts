// Build the Taste Atlas: resolve the probe entities on Qloo, pull a heatmap of
// each probe for each city, assemble the grid, districts and social graph, name
// the districts with Claude, and write data/atlas/<city>.json plus twins.json.
//
//   npm run atlas                      # every city
//   npm run atlas -- chicago london    # some cities
//   npm run atlas -- --no-names        # skip district naming
//
// Qloo responses are cached under .cache/qloo, so reruns cost no quota.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assembleAtlas } from "../src/lib/atlas/assemble";
import { cosineRows, coverageOf, districtProfiles, fromBase64, tasteLean } from "../src/lib/atlas/build";
import { CITIES, type CityDef } from "../src/lib/atlas/cities";
import { nameDistricts } from "../src/lib/atlas/name";
import { PROBES } from "../src/lib/atlas/probes";
import type { AtlasProbe, CityAtlas } from "../src/lib/atlas/types";
import { qlooUsage } from "../src/lib/qloo/client";
import { heatmap, localities, resolveEntity } from "../src/lib/qloo/entities";

process.env.QLOO_DISK_CACHE ??= ".cache/qloo";
const OUT = "data/atlas";

const args = process.argv.slice(2);
const skipNames = args.includes("--no-names");
const wanted = args.filter((a) => !a.startsWith("--"));
const cities = wanted.length ? CITIES.filter((c) => wanted.includes(c.id)) : CITIES;

async function resolveProbes(): Promise<AtlasProbe[]> {
  const file = join(OUT, "probes.json");
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const out: AtlasProbe[] = [];
  for (const p of PROBES) {
    const { entity, candidates } = await resolveEntity(p.query, p.type);
    if (!entity) {
      console.warn(`  ! probe not found: ${p.query} (${p.type}); top hits: ${candidates.slice(0, 3).map((c) => c.name).join(", ")}`);
      continue;
    }
    out.push({ id: entity.id, name: entity.name, label: p.label, type: p.type, domain: p.domain });
    console.log(`  probe ${p.label} → ${entity.name}${entity.disambiguation ? ` (${entity.disambiguation})` : ""}`);
  }
  await writeFile(file, JSON.stringify(out, null, 1));
  return out;
}

async function buildCity(city: CityDef, probes: AtlasProbe[]) {
  const started = Date.now();
  const before = qlooUsage().networkCalls;
  console.log(`\n${city.name}: ${probes.length} probe heatmaps…`);
  const heats = await Promise.all(
    probes.map(async (p) => {
      const { cells } = await heatmap(city.center, city.radiusKm, { entityIds: [p.id] });
      return cells;
    }),
  );
  // Neighbourhood names: each probe's locality heatmap lists the 50 neighbourhoods it is strongest
  // in, so the union over all probes covers most of the city.
  const nameProbes = probes;
  const locs = (await Promise.all(nameProbes.map((p) => localities(city.center, city.radiusKm, { entityIds: [p.id] })))).flatMap((r) => r.localities);

  const { atlas, briefs } = assembleAtlas({ city, probes, heats, localities: locs, qlooCalls: heats.length + nameProbes.length });
  console.log(
    `  ${atlas.cells.length} cells, ${atlas.districts.length} districts, ${atlas.localities.length} neighbourhoods, precision ${atlas.stats.geohashPrecision.join("/")}, ` +
      `${qlooUsage().networkCalls - before} network calls, ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );

  if (!skipNames) {
    try {
      const names = await nameDistricts(city.name, briefs);
      for (const d of atlas.districts) {
        const n = names.get(d.id);
        if (n) {
          d.name = n.name;
          d.blurb = n.blurb;
        }
      }
    } catch (e) {
      console.warn(`  ! naming failed: ${(e as Error).message}`);
    }
  }
  for (const d of atlas.districts) {
    console.log(
      `  [${d.id}] ${d.name} · ${d.cells} cells · ${(d.activityShare * 100).toFixed(0)}% · ${d.signature
        .slice(0, 4)
        .map((s) => `${probes[s.probe].label} ${s.lift}×`)
        .join(", ")} · ${d.places.slice(0, 3).join(", ")}`,
    );
  }
  await writeFile(join(OUT, `${city.id}.json`), JSON.stringify(atlas));
  return atlas;
}

/** District-to-district taste similarity across cities (cosine of mean z-profiles). */
function twins(atlases: CityAtlas[]) {
  const profiles = atlases.map((a) => {
    const n = a.cells.length;
    const m = a.probes.length;
    const matrix = fromBase64(a.vectors);
    const lean = tasteLean(matrix, n, m, coverageOf(matrix, n, m));
    return districtProfiles(lean, n, m, a.cells.map((c) => c.district), a.districts.length);
  });
  const out: { from: { city: string; district: number }; to: { city: string; district: number; similarity: number }[] }[] = [];
  atlases.forEach((a, ai) => {
    const m = a.probes.length;
    a.districts.forEach((d) => {
      const matches: { city: string; district: number; similarity: number }[] = [];
      atlases.forEach((b, bi) => {
        if (bi === ai) return;
        let best = { district: 0, similarity: -1 };
        b.districts.forEach((e) => {
          const s = cosineRows(profiles[ai], d.id, profiles[bi], e.id, m);
          if (s > best.similarity) best = { district: e.id, similarity: Math.round(s * 1000) / 1000 };
        });
        matches.push({ city: b.city.id, ...best });
      });
      out.push({ from: { city: a.city.id, district: d.id }, to: matches.sort((x, y) => y.similarity - x.similarity) });
    });
  });
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log("Resolving probes…");
  const probes = await resolveProbes();
  console.log(`${probes.length} of ${PROBES.length} probes resolved.`);
  for (const city of cities) await buildCity(city, probes);

  const all: CityAtlas[] = [];
  for (const c of CITIES) {
    const f = join(OUT, `${c.id}.json`);
    if (existsSync(f)) all.push(JSON.parse(await readFile(f, "utf8")));
  }
  if (all.length > 1) {
    await writeFile(join(OUT, "twins.json"), JSON.stringify(twins(all)));
    console.log(`\ntwins.json: ${all.length} cities`);
  }
  const u = qlooUsage();
  console.log(`Qloo network calls: ${u.networkCalls}; month remaining: ${u.monthRemaining ?? "?"} of ${u.monthLimit ?? "?"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
