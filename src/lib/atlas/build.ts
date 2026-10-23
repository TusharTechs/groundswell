// Pure functions that turn Qloo heatmaps into a city atlas: a common grid of
// 6-character geohash cells, a taste fingerprint per cell, taste districts
// (k-means on the fingerprints), and a social graph (adjacent cells plus long
// ties between distant cells with similar taste).

import ngeohash from "ngeohash";
import type { HeatCell } from "../qloo/entities";
import { areaKm2, centroid, distanceKm, inRings, parseWkt, type Point, type Ring } from "./geo";

export type Gh6Heat = Map<string, { affinity: number; popularity: number }>;

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Collapse a heatmap to 6-character geohash cells: finer cells are averaged, coarser cells copied to their children. */
export function toGh6(cells: HeatCell[]): Gh6Heat {
  const acc = new Map<string, { a: number; p: number; n: number }>();
  const add = (gh: string, a: number, p: number) => {
    const cur = acc.get(gh) ?? { a: 0, p: 0, n: 0 };
    cur.a += a;
    cur.p += p;
    cur.n += 1;
    acc.set(gh, cur);
  };
  for (const c of cells) {
    if (c.geohash.length >= 6) add(c.geohash.slice(0, 6), c.affinity, c.popularity);
    else if (c.geohash.length === 5) for (const ch of BASE32) add(c.geohash + ch, c.affinity, c.popularity);
  }
  const out: Gh6Heat = new Map();
  for (const [gh, v] of acc) out.set(gh, { affinity: v.a / v.n, popularity: v.p / v.n });
  return out;
}

export function centerOf(gh: string): Point {
  const d = ngeohash.decode(gh);
  return [d.longitude, d.latitude];
}

/** Cells inside the city circle that appear in at least `minPresence` probe heatmaps. */
export function buildGrid(center: Point, radiusKm: number, heats: Gh6Heat[], minPresence: number): string[] {
  const count = new Map<string, number>();
  for (const h of heats) for (const gh of h.keys()) count.set(gh, (count.get(gh) ?? 0) + 1);
  return [...count.entries()]
    .filter(([gh, n]) => n >= minPresence && distanceKm(centerOf(gh), center) <= radiusKm * 1.02)
    .map(([gh]) => gh)
    .sort();
}

/**
 * cells × probes matrix of within-city percentiles of affinity, as bytes
 * (1–255 where Qloo returned the cell, 0 where it didn't). Percentiles make
 * probes comparable: raw heatmap affinity is distributed differently for each.
 */
export function percentileMatrix(ghs: string[], heats: Gh6Heat[]): Uint8Array {
  const n = ghs.length;
  const m = heats.length;
  const out = new Uint8Array(n * m);
  for (let p = 0; p < m; p++) {
    const present: { i: number; a: number }[] = [];
    ghs.forEach((gh, i) => {
      const v = heats[p].get(gh);
      if (v) present.push({ i, a: v.affinity });
    });
    present.sort((x, y) => x.a - y.a);
    // Ties share the average rank.
    let j = 0;
    while (j < present.length) {
      let k = j;
      while (k + 1 < present.length && present[k + 1].a === present[j].a) k++;
      const pct = ((j + k) / 2 + 1) / present.length;
      for (let t = j; t <= k; t++) out[present[t].i * m + p] = Math.max(1, Math.round(pct * 255));
      j = k + 1;
    }
  }
  return out;
}

/** Relative activity per cell: mean popularity where present × share of probes present, scaled to max 1. */
export function activityOf(ghs: string[], heats: Gh6Heat[]): number[] {
  const raw = ghs.map((gh) => {
    let sum = 0;
    let n = 0;
    for (const h of heats) {
      const v = h.get(gh);
      if (v) {
        sum += v.popularity;
        n++;
      }
    }
    return n ? (sum / n) * Math.sqrt(n / heats.length) : 0;
  });
  const max = Math.max(...raw, 1e-9);
  return raw.map((v) => v / max);
}

/** Column z-scores of the byte matrix. */
export function zColumns(matrix: Uint8Array, n: number, m: number): Float32Array {
  const z = new Float32Array(n * m);
  for (let p = 0; p < m; p++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += matrix[i * m + p];
    mean /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (matrix[i * m + p] - mean) ** 2;
    const sd = Math.sqrt(v / n) || 1;
    for (let i = 0; i < n; i++) z[i * m + p] = (matrix[i * m + p] - mean) / sd;
  }
  return z;
}

/**
 * Probes must cover this share of a city's cells to shape its districts. Below
 * it, Qloo returns a probe only where it has dense data, so presence measures
 * activity rather than taste; such probes are kept for display only.
 */
export const MIN_COVERAGE = 0.45;

/** Share of grid cells each probe's heatmap covers. */
export function coverageOf(matrix: Uint8Array, n: number, m: number): number[] {
  const out = new Array(m).fill(0);
  for (let i = 0; i < n; i++) for (let p = 0; p < m; p++) if (matrix[i * m + p] > 0) out[p]++;
  return out.map((c) => c / n);
}

/**
 * A cell's taste lean. Qloo returns a heatmap cell only where it has enough
 * data, so busy downtown cells appear for every niche probe and quiet outer
 * cells for few: raw values mostly measure data density. For each probe we
 * take column z-scores, remove the part explained by how many probes the cell
 * appears in (a least-squares fit on that density), clip outliers, down-weight
 * probes with sparse coverage, and centre each cell on its own mean. What is
 * left is what the cell leans toward relative to cells with as much data.
 */
export function tasteLean(matrix: Uint8Array, n: number, m: number, coverage: number[], minCoverage = MIN_COVERAGE, clip = 3): Float32Array {
  const z = zColumns(matrix, n, m);
  const density = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let p = 0; p < m; p++) if (matrix[i * m + p] > 0) c++;
    density[i] = c / m;
  }
  const dMean = density.reduce((s, x) => s + x, 0) / n;
  const dVar = density.reduce((s, x) => s + (x - dMean) ** 2, 0) || 1;
  const w = coverage.map((c) => (c < minCoverage ? 0 : Math.min(1, c / 0.7)));
  const active = w.reduce((s, x) => s + (x > 0 ? 1 : 0), 0) || 1;
  const out = new Float32Array(n * m);
  for (let p = 0; p < m; p++) {
    if (!w[p]) continue;
    let cov = 0;
    for (let i = 0; i < n; i++) cov += (density[i] - dMean) * z[i * m + p];
    const beta = cov / dVar; // z has mean 0, so the intercept is −beta × dMean
    for (let i = 0; i < n; i++) {
      const r = z[i * m + p] - beta * (density[i] - dMean);
      out[i * m + p] = w[p] * Math.max(-clip, Math.min(clip, r));
    }
  }
  for (let i = 0; i < n; i++) {
    let mean = 0;
    for (let p = 0; p < m; p++) if (w[p] > 0) mean += out[i * m + p];
    mean /= active;
    for (let p = 0; p < m; p++) if (w[p] > 0) out[i * m + p] -= mean;
  }
  return out;
}

/** Mean byte value per probe in each district divided by the city mean: "2.1× the city average". */
export function districtLift(matrix: Uint8Array, n: number, m: number, labels: number[], k: number): Float32Array {
  const city = new Float64Array(m);
  const sums = new Float64Array(k * m);
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    counts[labels[i]]++;
    for (let p = 0; p < m; p++) {
      city[p] += matrix[i * m + p];
      sums[labels[i] * m + p] += matrix[i * m + p];
    }
  }
  const out = new Float32Array(k * m);
  for (let c = 0; c < k; c++)
    for (let p = 0; p < m; p++) out[c * m + p] = counts[c] && city[p] ? sums[c * m + p] / counts[c] / (city[p] / n) : 0;
  return out;
}

export function geoNeighbours(ghs: string[]): number[][] {
  const index = new Map(ghs.map((gh, i) => [gh, i]));
  return ghs.map((gh) => ngeohash.neighbors(gh).flatMap((nb) => (index.has(nb) ? [index.get(nb)!] : [])));
}

/** Blend each cell's fingerprint with its neighbours' so districts form coherent areas. */
export function smooth(z: Float32Array, n: number, m: number, geo: number[][], alpha = 0.5): Float32Array {
  const out = new Float32Array(n * m);
  for (let i = 0; i < n; i++) {
    const nb = geo[i];
    for (let p = 0; p < m; p++) {
      let s = 0;
      for (const j of nb) s += z[j * m + p];
      out[i * m + p] = nb.length ? (1 - alpha) * z[i * m + p] + (alpha * s) / nb.length : z[i * m + p];
    }
  }
  return out;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(data: Float32Array, i: number, c: Float32Array, j: number, m: number) {
  let s = 0;
  for (let p = 0; p < m; p++) {
    const d = data[i * m + p] - c[j * m + p];
    s += d * d;
  }
  return s;
}

/** k-means++ with a fixed seed, weighted by `weights` (cell activity). */
export function kmeans(data: Float32Array, n: number, m: number, k: number, weights: number[], seed = 7, iters = 60) {
  const rand = mulberry32(seed);
  const centroids = new Float32Array(k * m);
  // k-means++ seeding
  const first = Math.floor(rand() * n);
  centroids.set(data.subarray(first * m, first * m + m), 0);
  const best = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      best[i] = Math.min(best[i], dist2(data, i, centroids, c - 1, m));
      total += best[i] * (0.2 + weights[i]);
    }
    let r = rand() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= best[i] * (0.2 + weights[i]);
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.set(data.subarray(pick * m, pick * m + m), c * m);
  }
  const labels = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(data, i, centroids, c, m);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      if (labels[i] !== bi || it === 0) changed++;
      labels[i] = bi;
    }
    const sums = new Float64Array(k * m);
    const wsum = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      const w = 0.2 + weights[i];
      wsum[labels[i]] += w;
      for (let p = 0; p < m; p++) sums[labels[i] * m + p] += data[i * m + p] * w;
    }
    for (let c = 0; c < k; c++) if (wsum[c] > 0) for (let p = 0; p < m; p++) centroids[c * m + p] = sums[c * m + p] / wsum[c];
    if (!changed) break;
  }
  return { labels, centroids };
}

/** Simplified silhouette: how much closer each cell is to its own centroid than to the next nearest. */
export function separation(data: Float32Array, n: number, m: number, k: number, labels: Int32Array, centroids: Float32Array) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.sqrt(dist2(data, i, centroids, labels[i], m));
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== labels[i]) b = Math.min(b, Math.sqrt(dist2(data, i, centroids, c, m)));
    s += (b - a) / Math.max(a, b, 1e-9);
  }
  return s / n;
}

/** Pick k in [kMin, kMax] by separation, then order districts by size (largest first). */
export function clusterDistricts(data: Float32Array, n: number, m: number, weights: number[], kMin = 5, kMax = 8, minShare = 0.04) {
  let pick: { k: number; labels: Int32Array; centroids: Float32Array; score: number } | null = null;
  for (let k = kMin; k <= kMax; k++) {
    const { labels, centroids } = kmeans(data, n, m, k, weights);
    const sizes = new Array(k).fill(0);
    for (const l of labels) sizes[l]++;
    // A district must hold a meaningful share of cells to be worth naming.
    if (sizes.some((s) => s < n * minShare)) continue;
    const score = separation(data, n, m, k, labels, centroids);
    if (!pick || score > pick.score) pick = { k, labels, centroids, score };
  }
  if (!pick) {
    const { labels, centroids } = kmeans(data, n, m, kMin, weights);
    pick = { k: kMin, labels, centroids, score: 0 };
  }
  const sizes = new Array(pick.k).fill(0);
  for (const l of pick.labels) sizes[l]++;
  const order = sizes.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const remap = new Map(order.map((old, idx) => [old, idx]));
  return { k: pick.k, labels: Array.from(pick.labels, (l) => remap.get(l)!), score: pick.score };
}

/** Mean z-score per probe for each district. */
export function districtProfiles(z: Float32Array, n: number, m: number, labels: number[], k: number): Float32Array {
  const sums = new Float64Array(k * m);
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    counts[labels[i]]++;
    for (let p = 0; p < m; p++) sums[labels[i] * m + p] += z[i * m + p];
  }
  const out = new Float32Array(k * m);
  for (let c = 0; c < k; c++) for (let p = 0; p < m; p++) out[c * m + p] = counts[c] ? sums[c * m + p] / counts[c] : 0;
  return out;
}

function unitRows(z: Float32Array, n: number, m: number): Float32Array {
  const out = new Float32Array(n * m);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let p = 0; p < m; p++) s += z[i * m + p] ** 2;
    const norm = Math.sqrt(s) || 1;
    for (let p = 0; p < m; p++) out[i * m + p] = z[i * m + p] / norm;
  }
  return out;
}

/** Cosine similarity between rows of two z-matrices with the same columns. */
export function cosineRows(a: Float32Array, i: number, b: Float32Array, j: number, m: number) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let p = 0; p < m; p++) {
    dot += a[i * m + p] * b[j * m + p];
    na += a[i * m + p] ** 2;
    nb += b[j * m + p] ** 2;
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/**
 * Weak ties: for each cell, the `k` most taste-similar cells at least `minKm`
 * away. People meet across town (venues, work, feeds), and those ties carry
 * word of mouth between distant neighbourhoods with similar taste.
 */
export function tasteTies(z: Float32Array, n: number, m: number, coords: Point[], k = 4, minKm = 3, minSim = 0.4): [number, number][][] {
  const u = unitRows(z, n, m);
  const ties: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const top: [number, number][] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let dot = 0;
      for (let p = 0; p < m; p++) dot += u[i * m + p] * u[j * m + p];
      if (dot < minSim) continue;
      if (top.length === k && dot <= top[k - 1][1]) continue;
      if (distanceKm(coords[i], coords[j]) < minKm) continue;
      top.push([j, Math.round(dot * 1000) / 1000]);
      top.sort((a, b) => b[1] - a[1]);
      if (top.length > k) top.pop();
    }
    ties.push(top);
  }
  return ties;
}

// Qloo mixes counties, states, townships and time zones in with neighbourhoods.
const NOT_A_NEIGHBOURHOOD = /\b(county|township|timezone|time zone|council district|state of|united states|contiguous|metropolitan|greater|inner|outer|prefecture|municipality)\b/i;
// London's boroughs are its natural neighbourhood unit; drop the formal prefix.
const tidyName = (name: string) => name.replace(/^(London Borough of|Royal Borough of|City of) /, (m) => (m === "City of " ? m : "")).trim();

export interface LocalityShape {
  name: string;
  rings: Ring[];
  area: number;
}

/** Usable neighbourhood shapes: not admin areas, not tiny, not the whole city. */
export function neighbourhoodShapes(raw: { name: string; boundary: string }[], cityName: string, maxKm2 = 160): LocalityShape[] {
  const seen = new Set<string>();
  return raw.flatMap((l) => {
    const name = tidyName(l.name);
    if (NOT_A_NEIGHBOURHOOD.test(name) || name.toLowerCase() === cityName.toLowerCase() || seen.has(name)) return [];
    const rings = parseWkt(l.boundary);
    const area = rings.length ? areaKm2(rings) : 0;
    if (area < 0.2 || area > maxKm2) return [];
    seen.add(name);
    return [{ name, rings, area }];
  });
}

/** The smallest neighbourhood containing each point, else the nearest one within 2 km. */
export function assignLocalities(points: Point[], shapes: LocalityShape[]): (string | null)[] {
  const bySize = [...shapes].sort((a, b) => a.area - b.area);
  const centers = bySize.map((s) => centroid(s.rings));
  return points.map((pt) => {
    const hit = bySize.find((s) => inRings(pt, s.rings));
    if (hit) return hit.name;
    let best: string | null = null;
    let bd = 2;
    bySize.forEach((s, i) => {
      const d = distanceKm(pt, centers[i]);
      if (d < bd) {
        bd = d;
        best = s.name;
      }
    });
    return best;
  });
}

export const DISTRICT_COLORS: [number, number, number][] = [
  [255, 122, 89], // ember
  [255, 202, 88], // amber
  [72, 214, 166], // mint
  [86, 180, 255], // sky
  [178, 140, 255], // violet
  [255, 92, 170], // magenta
  [160, 214, 92], // lime
  [255, 160, 64], // orange
];

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
