import { describe, expect, it } from "vitest";
import { bootstrap, scoreMethod, spearman } from "../coldstart";

describe("cold-start metrics", () => {
  const truth = Array.from({ length: 100 }, (_, i) => i);
  const flat = new Array(100).fill(0);
  it("scores a perfect prediction at 1 and a reversed one at 0", () => {
    expect(scoreMethod(truth, truth, flat)).toMatchObject({ overlap: 1, capture: 1 });
    const reversed = truth.map((x) => -x);
    expect(scoreMethod(reversed, truth, flat).overlap).toBe(0);
    expect(spearman(reversed, truth)).toBeCloseTo(-1, 6);
  });
  it("treats negative truth as no audience when weighing capture", () => {
    const t = truth.map((x) => x - 50);
    expect(scoreMethod(t, t, flat).capture).toBe(1);
  });
  it("gives a bootstrap interval around the mean", () => {
    const b = bootstrap([0.2, 0.4, 0.6, 0.8]);
    expect(b.mean).toBeCloseTo(0.5, 6);
    expect(b.lo).toBeLessThan(0.5);
    expect(b.hi).toBeGreaterThan(0.5);
  });
});
