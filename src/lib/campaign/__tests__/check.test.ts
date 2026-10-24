import { describe, expect, it } from "vitest";
import { replanProblems } from "../check";

const budget = {
  remaining: 3000,
  byStep: [
    { label: "Ads in North", kind: "social", zone: 0, remaining: 2000 },
    { label: "Host-read", kind: "podcast", zone: null, remaining: 0 },
    { label: "Cafe A", kind: "partner", zone: 0, remaining: 1000 },
  ],
};
const callable = { zones: [{ verdict: "behind" as const }] };
const tooEarly = { zones: [{ verdict: "too early" as const }] };
const move = (from_step: number, amount: number, to_zone_id: number | null = 0) => ({ from_step, to: "Instagram ads", to_zone_id, amount, why: "test" });

describe("Field Analyst checks", () => {
  const ctx = { budget, report: callable, zoneIds: [0, 1], found: new Set(["place-1"]) };

  it("accepts moves within what each action has left", () => {
    expect(replanProblems({ moves: [move(0, 1500), move(2, 900)], new_partners: [] }, ctx)).toEqual([]);
  });

  it("rejects moving more than an action has left, even across several moves", () => {
    expect(replanProblems({ moves: [move(0, 1500), move(0, 800)], new_partners: [] }, ctx)[0]).toMatch(/has \$2000 left, not \$2300/);
    expect(replanProblems({ moves: [move(1, 100)], new_partners: [] }, ctx)[0]).toMatch(/has \$0 left/);
  });

  it("rejects unknown actions, zones and partners it didn't find on Qloo", () => {
    const problems = replanProblems({ moves: [move(9, 100), move(0, 100, 7)], new_partners: [{ place_id: "made-up", role: "poster", why: "" }] }, ctx).join(" ");
    expect(problems).toMatch(/No action 9/);
    expect(problems).toMatch(/Unknown zone 7/);
    expect(problems).toMatch(/made-up didn't come from find_places/);
  });

  it("keeps moves to a tenth of what's left while every neighbourhood is too early", () => {
    const early = { ...ctx, report: tooEarly };
    expect(replanProblems({ moves: [move(0, 300)], new_partners: [] }, early)).toEqual([]);
    expect(replanProblems({ moves: [move(0, 600)], new_partners: [] }, early)[0]).toMatch(/too early/);
  });
});
