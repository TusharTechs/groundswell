import { describe, expect, it } from "vitest";
import { assertKnownParams } from "../params";

describe("assertKnownParams", () => {
  it("accepts documented insights params", () => {
    expect(() =>
      assertKnownParams("/v2/insights", {
        "filter.type": "urn:entity:movie",
        "signal.demographics.age": "24_and_younger",
        "filter.results.entities": "a,b",
      }),
    ).not.toThrow();
  });

  it("rejects a typo that Qloo would silently ignore", () => {
    expect(() => assertKnownParams("/v2/insights", { "signal.demographic.age": "24_and_younger" })).toThrow(
      /signal.demographic.age/,
    );
  });

  it("rejects unknown paths", () => {
    expect(() => assertKnownParams("/recommendations", {})).toThrow(/Unknown Qloo path/);
  });
});
