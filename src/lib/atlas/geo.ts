// Small, dependency-free geometry for Qloo locality boundaries: parse the
// WKT boundaries Qloo returns, thin them for the browser, and measure them.

export type Point = [lon: number, lat: number];
export type Ring = Point[];

/** POLYGON and MULTIPOLYGON outer rings. Holes are dropped; anything else returns []. */
export function parseWkt(wkt: string): Ring[] {
  const kind = /^\s*(MULTIPOLYGON|POLYGON)\s*\(/i.exec(wkt)?.[1]?.toUpperCase();
  if (!kind) return [];
  // Each polygon is "((outer), (hole), …)"; keep the first ring of each.
  const polygons = kind === "POLYGON" ? [wkt.slice(wkt.indexOf("("))] : wkt.slice(wkt.indexOf("(") + 1).match(/\(\([^()]*\)(?:\s*,\s*\([^()]*\))*\)/g) ?? [];
  const rings: Ring[] = [];
  for (const poly of polygons) {
    const outer = /\(\(([^()]*)\)/.exec(poly)?.[1];
    if (!outer) continue;
    const ring = outer
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).map(Number) as Point)
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Drop points closer than `minDeg` to the last kept one, and round to ~10 m. */
export function thin(ring: Ring, minDeg = 0.0015): Ring {
  const out: Ring = [];
  for (const [lon, lat] of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(lon - last[0], lat - last[1]) >= minDeg) out.push([Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]);
  }
  return out.length >= 3 ? out : ring.slice(0, 3);
}

/** Approximate area in km² (shoelace on an equirectangular projection; fine at city scale). */
export function areaKm2(rings: Ring[]): number {
  let total = 0;
  for (const ring of rings) {
    const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
    const kx = 111.32 * Math.cos(lat0);
    const ky = 110.57;
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

export function centroid(rings: Ring[]): Point {
  const pts = rings.flat();
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

export function distanceKm(a: Point, b: Point): number {
  const kx = 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.57);
}

/** Ray-casting point-in-polygon on [lon, lat] rings. */
export function inRing([x, y]: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const inRings = (p: Point, rings: Ring[]) => rings.some((r) => inRing(p, r));
