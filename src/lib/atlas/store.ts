// Server-side access to the built city atlases (data/atlas/*.json), cached in memory.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fromBase64 } from "./build";
import { CITIES } from "./cities";
import type { CityAtlas } from "./types";

const DIR = join(process.cwd(), "data", "atlas");
const cache = new Map<string, Promise<CityAtlas>>();

export function loadAtlas(cityId: string): Promise<CityAtlas> {
  if (!CITIES.some((c) => c.id === cityId)) return Promise.reject(new Error(`Unknown city "${cityId}".`));
  let hit = cache.get(cityId);
  if (!hit) {
    hit = readFile(join(DIR, `${cityId}.json`), "utf8").then((s) => JSON.parse(s) as CityAtlas);
    hit.catch(() => cache.delete(cityId));
    cache.set(cityId, hit);
  }
  return hit;
}

export async function availableCities(): Promise<string[]> {
  const ok = await Promise.all(CITIES.map((c) => loadAtlas(c.id).then(() => c.id, () => null)));
  return ok.filter((x): x is string => Boolean(x));
}

/** The atlas's cells × probes percentile matrix (0–255). */
export function vectorsOf(atlas: CityAtlas): Uint8Array {
  return fromBase64(atlas.vectors);
}
