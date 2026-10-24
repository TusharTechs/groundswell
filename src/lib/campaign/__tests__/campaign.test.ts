import { describe, expect, it } from "vitest";
import { calendar, targetingSheet, trackedLinks } from "../../kit/build";
import type { Kit, KitInput } from "../../kit/types";
import type { Scan } from "../../store";
import { campaignDay, campaignStart, remainingBudget, scanReport, verdictOf } from "../report";
import { demoMultipliers, simulateWeek } from "../simulate";

function input(): KitInput {
  return {
    campaignId: "test-campaign",
    cityId: "chicago",
    title: "A Test Launch",
    pitch: "A test launch. 21+.",
    kind: "concert",
    language: "English",
    venue: "Test Hall",
    launchDate: "2026-12-04",
    days: 28,
    budget: 10000,
    allAges: false,
    noAlcohol: false,
    ageLimit: "21+",
    launchUrl: null,
    comps: ["Artist A", "Artist B"],
    compIds: ["a", "b"],
    peakAge: "25_to_29",
    tags: ["tag one"],
    zones: [
      { id: 0, locality: "North", district: "D0", signature: [], share: 0.3, center: [-87.6, 41.9], cells: [0, 1, 2] },
      { id: 1, locality: "South", district: "D1", signature: [], share: 0.1, center: [-87.6, 41.8], cells: [3, 4] },
    ],
    partners: [
      { id: "p-a", name: "Cafe A", category: "Cafe", address: null, phone: null, website: null, role: "poster", why: null, zone: 0, affinity: 0.8, drivers: [], lon: -87.6, lat: 41.9, popupDaysBefore: null },
      { id: "p-b", name: "Shop B", category: "Record store", address: null, phone: null, website: null, role: "poster", why: null, zone: 1, affinity: 0.7, drivers: [], lon: -87.6, lat: 41.8, popupDaysBefore: null },
    ],
    podcasts: [{ name: "A Podcast", daysBefore: 20 }],
    brands: [],
    steps: [
      { kind: "social", label: "Ads in North", zone: 0, startDaysBefore: 20, endDaysBefore: 11, cost: 1000 },
      { kind: "podcast", label: "Host-read", zone: null, startDaysBefore: 20, endDaysBefore: 20, cost: 3000 },
      { kind: "partner", label: "Cafe A", zone: 0, startDaysBefore: 27, endDaysBefore: 0, cost: 280 },
    ],
  };
}

function kit(): Kit {
  const i = input();
  return { campaignId: i.campaignId, createdAt: "", input: i, tagline: "", hashtags: [], zones: [], podcasts: [], partners: [], links: trackedLinks(i), checks: [], qlooCalls: 0 };
}

const scan = (code: string, day: number, k: Kit, simulated = false): Scan => ({ code, at: new Date(campaignStart(k).getTime() + day * 86_400_000).toISOString(), country: null, simulated });

describe("tracked links", () => {
  it("gives every poster, email, zone channel and podcast its own code", () => {
    const links = trackedLinks(input());
    expect(new Set(links.map((l) => l.code)).size).toBe(links.length);
    expect(links.map((l) => l.code)).toEqual(expect.arrayContaining(["p1", "p2", "e1", "z0ig", "z1tt", "z1x", "pod1"]));
  });
});

describe("scan report", () => {
  it("calls it too early under 30 scans", () => {
    expect(verdictOf(10, 5, 20, 0.25).verdict).toBe("too early");
  });
  it("calls a zone ahead or behind only at two standard errors", () => {
    // 100 scans, a zone expected to bring a quarter: sd = sqrt(100 × .25 × .75) ≈ 4.33.
    expect(verdictOf(34, 25, 100, 0.25).verdict).toBe("ahead");
    expect(verdictOf(30, 25, 100, 0.25).verdict).toBe("on track");
    expect(verdictOf(16, 25, 100, 0.25).verdict).toBe("behind");
  });
  it("expects scans in proportion to each zone's share of the natural audience", () => {
    const k = kit();
    const scans = [...Array.from({ length: 30 }, () => scan("z0ig", 3, k)), ...Array.from({ length: 30 }, () => scan("z1ig", 3, k)), scan("pod1", 3, k), scan("nope", 3, k)];
    const r = scanReport(k, scans);
    expect(r.total).toBe(61); // the unknown code is ignored
    expect(r.cityWide).toBe(1);
    const [north, south] = r.zones;
    expect(north.expectedShare).toBeCloseTo(0.75);
    expect(north.expected).toBeCloseTo(45);
    expect(north.verdict).toBe("behind");
    expect(south.verdict).toBe("ahead");
    expect(r.today).toBe(3);
  });
});

describe("budget clock", () => {
  it("counts actions not started in full, running ones by days left, finished ones not at all", () => {
    const k = kit();
    // Day 0 is 27 days before launch: everything is still to spend, except a day of the poster run.
    expect(remainingBudget(k, 0).remaining).toBe(1000 + 3000 + Math.round((280 * 27) / 28));
    // Day 12 is 15 days before launch: the podcast read is done, the ads are half way.
    const mid = remainingBudget(k, 12).byStep;
    expect(mid[0].remaining).toBe(Math.round((1000 * 4) / 10));
    expect(mid[1].remaining).toBe(0);
    expect(campaignDay(k, new Date(`${k.input.launchDate}T20:00:00Z`))).toBe(27);
  });
});

describe("simulated week", () => {
  it("is deterministic, labelled simulated, and stays inside the week", () => {
    const k = kit();
    const a = simulateWeek(k, 7);
    expect(a).toEqual(simulateWeek(k, 7));
    expect(a.length).toBeGreaterThan(50);
    expect(a.every((s) => s.simulated)).toBe(true);
    const days = a.map((s) => campaignDay(k, new Date(s.at)));
    expect(Math.min(...days)).toBe(7);
    expect(Math.max(...days)).toBe(13);
  });
  it("sets the biggest zone to fall short and the smallest to beat expectation", () => {
    const m = demoMultipliers(kit());
    expect(m.get(0)).toBeLessThan(1);
    expect(m.get(1)).toBeGreaterThan(1);
  });
});

describe("kit files", () => {
  it("writes a targeting brief per zone and a calendar with launch day", () => {
    const csv = targetingSheet(input()).split("\n");
    expect(csv[0]).toContain("radius_km");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toContain("25-29");
    const ics = calendar(input(), { campaignId: "test-campaign" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261204");
    expect(ics.split("BEGIN:VEVENT").length - 1).toBe(4);
  });
});
