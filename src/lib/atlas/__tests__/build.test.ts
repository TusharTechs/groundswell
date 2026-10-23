import { describe, expect, it } from "vitest";
import { activityOf, buildGrid, clusterDistricts, coverageOf, fromBase64, geoNeighbours, percentileMatrix, tasteLean, tasteTies, toBase64, toGh6 } from "../build";
import { inRing } from "../geo";

const cell = (geohash: string, affinity: number, popularity = 0.5) => ({ geohash, lat: 0, lon: 0, affinity, popularity });

describe("toGh6", () => {
  it("averages finer cells into their 6-character parent", () => {
    const g = toGh6([cell("dp3wq0v", 1, 0.8), cell("dp3wq0b", 0.5, 0.4), cell("dp3wq1a", 0.2)]);
    expect(g.get("dp3wq0")).toEqual({ affinity: 0.75, popularity: expect.closeTo(0.6, 6) });
    expect(g.get("dp3wq1")?.affinity).toBe(0.2);
  });
  it("copies 5-character cells to all 32 children", () => {
    const g = toGh6([cell("dp3wq", 0.9)]);
    expect(g.size).toBe(32);
    expect(g.get("dp3wqz")?.affinity).toBe(0.9);
  });
});

describe("grid and fingerprints", () => {
  const heats = [
    new Map([["dp3wq0", { affinity: 0.1, popularity: 0.5 }], ["dp3wq1", { affinity: 0.9, popularity: 0.5 }]]),
    new Map([["dp3wq0", { affinity: 0.6, popularity: 0.5 }]]),
  ];
  it("keeps cells present in enough probes, within the radius", () => {
    expect(buildGrid([-87.62, 41.88], 30, heats, 2)).toEqual(["dp3wq0"]);
    expect(buildGrid([-87.62, 41.88], 30, heats, 1)).toEqual(["dp3wq0", "dp3wq1"]);
    expect(buildGrid([0, 0], 30, heats, 1)).toEqual([]);
  });
  it("ranks each probe within the city and marks missing cells 0", () => {
    const m = percentileMatrix(["dp3wq0", "dp3wq1"], heats);
    expect(Array.from(m)).toEqual([128, 255, 255, 0]);
    expect(coverageOf(m, 2, 2)).toEqual([1, 0.5]);
  });
  it("scales activity to a maximum of 1", () => {
    const a = activityOf(["dp3wq0", "dp3wq1"], heats);
    expect(Math.max(...a)).toBe(1);
    expect(a[1]).toBeLessThan(a[0]);
  });
  it("round-trips the matrix through base64", () => {
    const m = new Uint8Array([0, 1, 254, 255]);
    expect(Array.from(fromBase64(toBase64(m)))).toEqual([0, 1, 254, 255]);
  });
});

describe("taste lean and districts", () => {
  // 40 cells, 4 probes: half the cells lean to probes 0–1, half to 2–3, at two data densities.
  const n = 40;
  const m = 4;
  const matrix = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) {
    const a = i < 20;
    const dense = i % 2 === 0 ? 1 : 0.6;
    matrix.set([a ? 240 : 60, a ? 220 : 80, a ? 70 : 230, a ? 50 : 250].map((v) => Math.round(v * dense)), i * m);
  }
  const lean = tasteLean(matrix, n, m, [1, 1, 1, 1]);
  it("centres every cell on its own mean", () => {
    for (let i = 0; i < n; i++) {
      const row = Array.from(lean.subarray(i * m, i * m + m));
      expect(Math.abs(row.reduce((s, x) => s + x, 0))).toBeLessThan(1e-4);
    }
  });
  it("separates the two taste groups regardless of density", () => {
    const { labels } = clusterDistricts(lean, n, m, new Array(n).fill(1), 2, 2, 0.1);
    expect(new Set(labels.slice(0, 20)).size).toBe(1);
    expect(new Set(labels.slice(20)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[20]);
  });
  it("ties only distant cells with similar taste", () => {
    const coords: [number, number][] = Array.from({ length: n }, (_, i) => [i * 0.05, 0]);
    const ties = tasteTies(lean, n, m, coords, 3, 3, 0.4);
    for (let i = 0; i < n; i++) for (const [j] of ties[i]) expect(i < 20).toBe(j < 20);
  });
});

describe("geometry", () => {
  it("finds points inside a ring and neighbours inside the grid", () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(inRing([0.5, 0.5], ring)).toBe(true);
    expect(inRing([1.5, 0.5], ring)).toBe(false);
    const nb = geoNeighbours(["dp3wq0", "dp3wq1", "u4pruy"]);
    expect(nb[0]).toContain(1);
    expect(nb[2]).toEqual([]);
  });
});
