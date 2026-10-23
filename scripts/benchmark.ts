// Cold-start geography test across every city.
//
// For each held-out entity T (not one of the atlas probes) in each city, two
// truths from T's own Qloo heatmap:
//   index        where T is over-represented: its percentile in a cell minus what
//                that cell shows for everything (the cell's mean across all probes),
//                the marketer's "index"; cells Qloo didn't return count as no signal
//   volume       T's raw heatmap percentile, which is highest wherever Qloo has the
//                most data, so it also measures where people are
// and predictions that never see T's heatmap:
//   groundswell  three Qloo-similar comparables' heatmap, as an index: the fit
//                Groundswell's simulator uses
//   comps (raw)  the comparables' raw heatmap (ablation: no correction)
//   people       where people are: cell activity, no taste data
//   claude       Claude alone names the 10 neighbourhoods (with coordinates) where
//                fans of the comparables live; cells within 1.5 km score by rank
//   control      the correction alone (minus the cell's baseline). If it scored well,
//                the index truth would be measuring our transform, not taste
// We score how many of T's top 10% cells each method finds (random: 10%).
//
//   npx tsx --env-file=.env scripts/benchmark.ts [city…]

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { toGh6 } from "../src/lib/atlas/build";
import { CITIES } from "../src/lib/atlas/cities";
import { distanceKm } from "../src/lib/atlas/geo";
import { loadAtlas } from "../src/lib/atlas/store";
import type { CityAtlas } from "../src/lib/atlas/types";
import { bootstrap, scoreMethod, type MethodScores } from "../src/lib/bench/coldstart";
import { baselineOf, fitFromHeat, rawFitFromHeat } from "../src/lib/launch/fit";
import { claude, FALLBACK, MODEL } from "../src/lib/llm";
import { qlooUsage } from "../src/lib/qloo/client";
import { heatmap, recommend, resolveEntity } from "../src/lib/qloo/entities";
import type { EntityType } from "../src/lib/qloo/params";

process.env.QLOO_DISK_CACHE ??= ".cache/qloo";

const TARGETS: { name: string; type: EntityType }[] = [
  { name: "Dua Lipa", type: "artist" },
  { name: "Rosalía", type: "artist" },
  { name: "Arctic Monkeys", type: "artist" },
  { name: "Doja Cat", type: "artist" },
  { name: "Zach Bryan", type: "artist" },
  { name: "Tame Impala", type: "artist" },
  { name: "J Balvin", type: "artist" },
  { name: "BLACKPINK", type: "artist" },
  { name: "Vans", type: "brand" },
  { name: "Sephora", type: "brand" },
  { name: "Ralph Lauren", type: "brand" },
  { name: "The Bear", type: "tv_show" },
];
const METHODS = ["groundswell", "compsRaw", "people", "claude", "control"] as const;
const TRUTHS = ["index", "volume"] as const;
type Truth = (typeof TRUTHS)[number];
type Method = (typeof METHODS)[number];

const Guess = z.object({
  neighbourhoods: z.array(z.object({ name: z.string(), lat: z.number(), lon: z.number() })).describe("Exactly 10, most concentrated first."),
});

const GUESS_CACHE = ".cache/claude-guesses.json";
let guessCache: Record<string, { name: string; lat: number; lon: number }[]> | null = null;

/** Claude's guesses are cached on disk so reruns are stable and free. */
async function claudeGuess(city: CityAtlas, comps: string[]) {
  const key = `${city.city.id}|${comps.join("|")}`;
  if (!guessCache) guessCache = existsSync(GUESS_CACHE) ? JSON.parse(await readFile(GUESS_CACHE, "utf8")) : {};
  if (guessCache![key]) return guessCache![key];
  const res = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Guess) },
    messages: [
      {
        role: "user",
        content: `A new launch is aimed at fans of ${comps.join(", ")}. In ${city.city.name}, ${city.city.country}, within about ${city.city.radiusKm} km of the centre, name the 10 neighbourhoods where these fans are most concentrated, most concentrated first, each with approximate latitude and longitude.`,
      },
    ],
  });
  const out = res.parsed_output?.neighbourhoods ?? [];
  guessCache![key] = out;
  await writeFile(GUESS_CACHE, JSON.stringify(guessCache));
  return out;
}

function claudeScores(atlas: CityAtlas, guesses: { lat: number; lon: number }[]) {
  return atlas.cells.map((c) => {
    let s = 0;
    guesses.forEach((g, rank) => {
      if (distanceKm([c.lon, c.lat], [g.lon, g.lat]) <= 1.5) s = Math.max(s, 10 - rank);
    });
    return s;
  });
}

async function main() {
  const wanted = process.argv.slice(2);
  const cities = wanted.length ? CITIES.filter((c) => wanted.includes(c.id)) : CITIES;
  const rows: { city: string; target: string; comps: string[]; scores: Record<Truth, Record<Method, MethodScores>> }[] = [];
  const skipped: { city: string; target: string; reason: string }[] = [];

  const resolved = [];
  for (const t of TARGETS) {
    const r = await resolveEntity(t.name, t.type);
    if (!r.entity) {
      console.warn(`! ${t.name} not found`);
      continue;
    }
    const recs = await recommend(t.type, { entityIds: [r.entity.id] }, { take: 3, excludeIds: [r.entity.id], popularityMin: 0.6 });
    resolved.push({ target: r.entity, comps: recs.items.slice(0, 3) });
    console.log(`${r.entity.name}: comps ${recs.items.slice(0, 3).map((c) => c.name).join(", ")}`);
  }

  for (const city of cities) {
    const atlas = await loadAtlas(city.id);
    const baseline = baselineOf(atlas);
    const activity = atlas.cells.map((c) => c.activity);
    for (const { target, comps } of resolved) {
      const truthHeat = toGh6((await heatmap(city.center, city.radiusKm, { entityIds: [target.id] })).cells);
      const truthFit = rawFitFromHeat(atlas, truthHeat);
      const coverage = truthFit.filter((f) => f > 0).length / truthFit.length;
      if (coverage < 0.15 || comps.length < 2) {
        skipped.push({ city: city.id, target: target.name, reason: coverage < 0.15 ? `Qloo heatmap covers only ${(coverage * 100).toFixed(0)}% of cells` : "too few comparables" });
        continue;
      }
      const index = (fit: number[]) => fit.map((f, i) => (f > 0 ? f - baseline[i] : -1));
      const truths: Record<Truth, number[]> = { index: index(truthFit), volume: truthFit };
      // The simulator's fit (fitFromHeat) is this index re-ranked to 0–1, so it ranks cells identically.
      const compHeat = toGh6((await heatmap(city.center, city.radiusKm, { entityIds: comps.map((c) => c.id) })).cells);
      const compRaw = rawFitFromHeat(atlas, compHeat);
      const preds: Record<Method, number[]> = {
        groundswell: fitFromHeat(atlas, compHeat, baseline),
        compsRaw: compRaw,
        people: activity,
        claude: claudeScores(atlas, await claudeGuess(atlas, comps.map((c) => c.name))),
        control: baseline.map((b) => -b),
      };
      const scores = Object.fromEntries(
        TRUTHS.map((t) => [t, Object.fromEntries(METHODS.map((m) => [m, scoreMethod(preds[m], truths[t], activity)]))]),
      ) as Record<Truth, Record<Method, MethodScores>>;
      rows.push({ city: city.id, target: target.name, comps: comps.map((c) => c.name), scores });
      const line = (t: Truth) => METHODS.map((m) => `${m} ${(scores[t][m].overlap * 100).toFixed(0)}`).join(" ");
      console.log(`${city.id.padEnd(12)} ${target.name.padEnd(15)} index: ${line("index")} | volume: ${line("volume")}`);
    }
  }

  const summary = Object.fromEntries(
    TRUTHS.map((t) => [
      t,
      Object.fromEntries(
        METHODS.map((m) => [
          m,
          {
            overlap: bootstrap(rows.map((r) => r.scores[t][m].overlap)),
            capture: bootstrap(rows.map((r) => r.scores[t][m].capture)),
            spearman: bootstrap(rows.map((r) => r.scores[t][m].spearman)),
          },
        ]),
      ),
    ]),
  );
  const byCity = Object.fromEntries(
    cities.map((c) => {
      const rs = rows.filter((r) => r.city === c.id);
      return [c.id, Object.fromEntries(TRUTHS.map((t) => [t, Object.fromEntries(METHODS.map((m) => [m, rs.length ? rs.reduce((s, r) => s + r.scores[t][m].overlap, 0) / rs.length : null]))]))];
    }),
  );
  const wins = rows.filter((r) => r.scores.index.groundswell.overlap > r.scores.index.claude.overlap).length;
  const ties = rows.filter((r) => r.scores.index.groundswell.overlap === r.scores.index.claude.overlap).length;
  await mkdir("data/benchmark", { recursive: true });
  await writeFile(
    "data/benchmark/coldstart.json",
    JSON.stringify({ runAt: new Date().toISOString(), targets: TARGETS.map((t) => t.name), cities: cities.map((c) => c.id), n: rows.length, summary, byCity, versusClaude: { wins, ties, losses: rows.length - wins - ties }, rows, skipped }, null, 1),
  );
  for (const t of TRUTHS) {
    console.log(`\n${t} truth: mean overlap of the true top 10% of cells (95% CI), capture`);
    for (const [m, v] of Object.entries(summary[t])) {
      const s = v as { overlap: { mean: number; lo: number; hi: number }; capture: { mean: number } };
      console.log(`  ${m.padEnd(12)} ${(s.overlap.mean * 100).toFixed(1)}% (${(s.overlap.lo * 100).toFixed(1)}–${(s.overlap.hi * 100).toFixed(1)}), capture ${s.capture.mean.toFixed(2)}`);
    }
    console.log(`  random       10.0%`);
  }
  console.log(`index truth: groundswell beats claude in ${wins} of ${rows.length} (ties ${ties}); skipped ${skipped.length}`);
  console.log(`Qloo network calls: ${qlooUsage().networkCalls}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
