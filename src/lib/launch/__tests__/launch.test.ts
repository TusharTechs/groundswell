import { describe, expect, it } from "vitest";
import { toBase64 } from "../../atlas/build";
import type { CityAtlas } from "../../atlas/types";
import type { Place } from "../../qloo/entities";
import { ASSUMPTIONS, buildMenu, selectionCost, toAction, wherePeopleArePlan, type MenuContext } from "../actions";
import { fitFromHeat, hotZones, massOf, rawFitFromHeat } from "../fit";
import { allowedPartner } from "../scout";
import { travelWeights } from "../venue";

/** A 6 × 6 grid of cells about 1 km apart, with two probes. */
function fakeAtlas(): CityAtlas {
  const cells = [];
  const geo: number[][] = [];
  const size = 6;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      cells.push({ gh: `cell${i}`, lon: -87.7 + c * 0.012, lat: 41.85 + r * 0.009, activity: c === 0 ? 1 : 0.3, locality: c < 3 ? "West" : "East", district: c < 3 ? 0 : 1 });
      geo.push([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < size && x >= 0 && x < size).map(([y, x]) => y * size + x));
    }
  // Probe 0 is high everywhere downtown (column 0); probe 1 is even.
  const m = 2;
  const vectors = new Uint8Array(cells.length * m);
  cells.forEach((_, i) => vectors.set([i % size === 0 ? 250 : 120, 128], i * m));
  return {
    version: 1,
    city: { id: "test", name: "Testville", country: "Nowhere", center: [-87.67, 41.87], radiusKm: 10, zoom: 11, locationQuery: "Testville", language: "English" },
    builtAt: "",
    probes: [
      { id: "p0", name: "P0", label: "P0", type: "artist", domain: "music" },
      { id: "p1", name: "P1", label: "P1", type: "brand", domain: "brand" },
    ],
    cells,
    vectors: toBase64(vectors),
    districts: [0, 1].map((id) => ({ id, name: `D${id}`, blurb: "", signature: [], antiSignature: [], places: [], cells: 18, activityShare: 0.5, center: [-87.67, 41.87] as [number, number], color: [1, 2, 3] as [number, number, number] })),
    geo,
    ties: cells.map(() => []),
    localities: [],
    stats: { qlooCalls: 0, probes: 2, activeProbes: 2, cells: cells.length, geohashPrecision: [6] },
  };
}

const place = (over: Partial<Place>): Place => ({ id: "x", name: "Somewhere", affinity: 0.9, lat: 41.86, lon: -87.69, categories: ["Coffee shop"], tags: [], drivers: [], openDays: [], ...over });

describe("fit", () => {
  const atlas = fakeAtlas();
  it("ranks raw heatmap affinity within the city", () => {
    const heat = new Map([["cell0", { affinity: 0.2 }], ["cell1", { affinity: 0.9 }]]);
    const raw = rawFitFromHeat(atlas, heat);
    expect(raw[1]).toBeGreaterThan(raw[0]);
    expect(raw[2]).toBe(0);
  });
  it("corrects for cells that are high for everything", () => {
    // Equal raw affinity: the busy downtown cell (column 0, high baseline) should rank below a quiet one.
    const heat = new Map([["cell0", { affinity: 0.8 }], ["cell3", { affinity: 0.8 }]]);
    const fit = fitFromHeat(atlas, heat);
    expect(fit[3]).toBeGreaterThan(fit[0]);
  });
  it("gives every cell a population floor", () => {
    expect(Math.min(...massOf(atlas))).toBeGreaterThanOrEqual(0.4);
  });
  it("builds non-overlapping hot zones, strongest first", () => {
    const audience = atlas.cells.map((_, i) => (i === 14 ? 100 : i === 35 ? 60 : 1));
    const zones = hotZones(atlas, atlas.cells.map(() => 0.5), audience, 3, 1.2);
    expect(zones[0].cells).toContain(14);
    const all = zones.flatMap((z) => z.cells);
    expect(new Set(all).size).toBe(all.length);
  });
  it("decays willingness to travel with distance", () => {
    const w = travelWeights(atlas, { lon: atlas.cells[0].lon, lat: atlas.cells[0].lat });
    expect(w[0]).toBe(1);
    expect(w[5]).toBeLessThan(w[1]);
  });
});

describe("partners", () => {
  const spec = { constraints: { allAges: false, noAlcohol: false, notes: [] }, venue: "Thalia Hall" };
  it("keeps places where a poster or flyer drop makes sense", () => {
    expect(allowedPartner(place({ categories: ["Record store"] }), spec)).toBe(true);
  });
  it("never partners with schools, places of worship, clinics or gun shops", () => {
    for (const c of ["High school", "Church", "Medical clinic", "Gun shop", "Cannabis dispensary"]) expect(allowedPartner(place({ categories: [c] }), spec)).toBe(false);
  });
  it("drops bars for no-alcohol briefs, and never lists the launch's own venue", () => {
    expect(allowedPartner(place({ categories: ["Cocktail bar"] }), { ...spec, constraints: { ...spec.constraints, noAlcohol: true } })).toBe(false);
    expect(allowedPartner(place({ name: "Thalia Hall", categories: ["Live music venue"] }), spec)).toBe(false);
  });
  it("keeps children's places for all-ages launches only", () => {
    const kids = place({ categories: ["Childrens cafe"] });
    expect(allowedPartner(kids, spec)).toBe(false);
    expect(allowedPartner(kids, { ...spec, constraints: { ...spec.constraints, allAges: true, noAlcohol: true } })).toBe(true);
  });
});

describe("actions", () => {
  const atlas = fakeAtlas();
  const fit = atlas.cells.map((_, i) => (i % 6) / 6);
  const zones = hotZones(atlas, fit, fit, 2, 1.2);
  const ctx: MenuContext = {
    atlas,
    fit,
    zones,
    partners: [{ ...place({ id: "p1", categories: ["Live music venue"] }), zone: zones[0].id, cell: zones[0].cells[0] }],
    podcasts: [{ id: "pod", name: "A Show", type: "podcast", tags: [], affinity: 0.95, popularity: 0.9, drivers: [], kind: "podcast" }],
    brands: [{ id: "b", name: "A Brand", type: "brand", tags: [], affinity: 0.9, drivers: [], kind: "brand", heat: fit }],
    days: 30,
    names: new Map(),
  };
  const menu = buildMenu(ctx);
  const byId = new Map(menu.map((c) => [c.id, c]));
  it("offers every kind of action from what was scouted", () => {
    expect(new Set(menu.map((c) => c.kind))).toEqual(new Set(["partner", "popup", "street", "social", "podcast", "collab"]));
  });
  it("prices social ads per day and everything else flat", () => {
    expect(selectionCost(byId.get("social:city")!, { id: "social:city", start: 0, days: 10 }, 30)).toBe(ASSUMPTIONS.social.costPerDayCity * 10);
    expect(selectionCost(byId.get("partner:p1")!, { id: "partner:p1" }, 30)).toBe(ASSUMPTIONS.partner.cost);
  });
  it("keeps every effect inside the campaign", () => {
    for (const c of menu) {
      const a = toAction({ id: c.id, day: 99, start: -5, days: 400 }, ctx, byId);
      expect(a).not.toBeNull();
      for (const e of a!.effects) {
        expect(e.from).toBeGreaterThanOrEqual(0);
        expect(e.to).toBeLessThanOrEqual(29);
      }
    }
  });
  it("keeps the benchmark plan within budget", () => {
    for (const budget of [3000, 12000, 50000]) {
      const plan = wherePeopleArePlan(atlas, budget, 42);
      expect(plan.reduce((s, a) => s + a.cost, 0)).toBeLessThanOrEqual(budget);
    }
  });
});

describe("venue names", () => {
  it("tries the name before a comma or 'in', and without a leading 'The'", async () => {
    const { venueQueries } = await import("../venue");
    expect(venueQueries("The Tabernacle, Atlanta")).toEqual(["The Tabernacle, Atlanta", "The Tabernacle", "Tabernacle"]);
    expect(venueQueries("Nitehawk Cinema in Williamsburg")).toEqual(["Nitehawk Cinema in Williamsburg", "Nitehawk Cinema"]);
  });
});
