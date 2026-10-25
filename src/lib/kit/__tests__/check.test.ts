import { describe, expect, it } from "vitest";
import type { CityAtlas } from "../../atlas/types";
import type { Zone } from "../../launch/fit";
import type { LaunchSpec } from "../../launch/spec";
import { kitProblems, type KitDraft } from "../check";
import { kitInputFrom } from "../input";
import type { KitInput } from "../types";

const input = (over: Partial<KitInput> = {}): KitInput => ({
  campaignId: "test-campaign",
  cityId: "chicago",
  title: "A Test Launch",
  pitch: "A test launch.",
  kind: "concert",
  language: "English",
  venue: "Test Hall",
  launchDate: "2026-12-04",
  days: 28,
  budget: 10000,
  allAges: false,
  noAlcohol: false,
  ageLimit: null,
  launchUrl: null,
  comps: ["Kali Uchis"],
  compIds: ["k"],
  peakAge: null,
  tags: [],
  zones: [{ id: 0, locality: "Pilsen", district: "D0", signature: [], share: 0.3, center: [-87.66, 41.85], cells: [0] }],
  partners: [{ id: "p-a", name: "Cafe A", category: "Cafe", address: null, phone: null, website: null, role: "poster", why: null, zone: 0, affinity: 0.8, drivers: [], lon: -87.66, lat: 41.85, popupDaysBefore: null }],
  podcasts: [],
  brands: [],
  steps: [],
  ...over,
});

const draft = (over: Partial<KitDraft["zones"][number]> = {}, partner: Partial<KitDraft["partners"][number]> = {}): KitDraft => ({
  tagline: "One night in Pilsen",
  blurb: "A test launch.",
  english: null,
  hashtags: [],
  zones: [
    {
      zone_id: 0,
      references: ["Bad Bunny"],
      poster_headline: "Pilsen, one night",
      poster_subline: "Latin R&B up close.",
      instagram: "Bad Bunny on repeat? Come out. {link}",
      tiktok_hook: "Bad Bunny on repeat?",
      tiktok_beats: ["One", "Two", "Three"],
      x_post: "Pilsen, one night. {link}",
      english: null,
      ...over,
    },
  ],
  podcasts: [],
  partners: [{ id: "p-a", subject: "A poster spot?", body: "Your visitors match people who love Kali Uchis. {link}", english: null, ...partner }],
});

describe("Creative Director checks", () => {
  const checked = new Map([["0|bad bunny", "strong here"]]);

  it("passes a draft whose references were checked and came back strong", () => {
    expect(kitProblems(input(), draft(), checked)).toEqual([]);
  });

  it("rejects a reference that wasn't checked for that neighbourhood, or came back weak", () => {
    expect(kitProblems(input(), draft(), new Map())[0]).toMatch(/wasn't checked/);
    expect(kitProblems(input(), draft(), new Map([["0|bad bunny", "weak here"]]))[0]).toMatch(/weak here in Pilsen/);
  });

  it("lets the comparables through without a check", () => {
    expect(kitProblems(input(), draft({ references: ["Kali Uchis"] }), new Map())).toEqual([]);
  });

  it("rejects copy without its tracked link and unbackable claims", () => {
    expect(kitProblems(input(), draft({ instagram: "Come out." }), checked).join(" ")).toMatch(/need \{link\}/);
    expect(kitProblems(input(), draft({ poster_subline: "Selling fast!" }), checked).join(" ")).toMatch(/remove claims like "Selling fast"/i);
  });

  it("rejects assumptions about a partner's premises and rankings", () => {
    expect(kitProblems(input(), draft({}, { body: "You have the space for a pop-up. {link}" }), checked).join(" ")).toMatch(/isn't something the data shows/);
    expect(kitProblems(input(), draft({}, { body: "You match more than any other place. {link}" }), checked).join(" ")).toMatch(/isn't something the data shows/);
  });

  it("asks for English translations when the city's language isn't English", () => {
    const problems = kitProblems(input({ language: "Japanese" }), draft(), checked).join(" ");
    expect(problems).toMatch(/English tagline and blurb/);
    expect(problems).toMatch(/English translations for: Pilsen, the email to p-a/);
  });

  it("asks for copy for every neighbourhood and an email to every partner", () => {
    const k = draft();
    k.zones = [];
    k.partners = [];
    const problems = kitProblems(input(), k, checked).join(" ");
    expect(problems).toMatch(/Write copy for: Pilsen/);
    expect(problems).toMatch(/Write emails to: Cafe A/);
  });
});

describe("kit input", () => {
  const zone = (id: number, audienceShare: number): Zone => ({ id, locality: `Zone ${id}`, center: [0, 0], cells: [id], audienceShare, district: 0, fit: 0.9 }) as unknown as Zone;
  const atlas = { city: { id: "chicago" }, districts: [{ name: "D0", signature: [] }], probes: [] } as unknown as CityAtlas;
  const spec = { title: "T", pitch: "P", kind: "concert", venue: null, days: 28, budget: 5000, constraints: { allAges: false, noAlcohol: false, notes: [] } } as unknown as LaunchSpec;
  const base = { campaignId: "run-abcdef12", atlas, spec, comps: [], compIds: [], peakAge: null, tags: [], partners: [], media: [], launchDate: "2026-12-04", launchUrl: null };
  const zones = [zone(0, 0.05), zone(1, 0.2), zone(2, 0.1), zone(3, 0.02)];

  it("writes for the strongest hot zones when the plan is all city-wide", () => {
    const input = kitInputFrom({ ...base, zones, candidates: [{ id: "social:city", kind: "social", label: "City ads", timing: "window", cost: 3000 }] as never, strategy: { selections: [{ id: "social:city", start: 0, days: 20 }], steps: [] } as never });
    expect(input.zones.map((z) => z.id)).toEqual([1, 2, 0]);
  });

  it("writes only for the zones the plan acts in when it has any", () => {
    const input = kitInputFrom({ ...base, zones, candidates: [{ id: "street:3", kind: "street", label: "Street team", zone: 3, timing: "day", cost: 400 }] as never, strategy: { selections: [{ id: "street:3", day: 5 }], steps: [] } as never });
    expect(input.zones.map((z) => z.id)).toEqual([3]);
  });
});
