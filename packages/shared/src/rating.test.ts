// Rating tests keep the ladder math predictable while the rest of the app changes around it.
import { describe, expect, it } from "vitest";

import { calculateExpectedScore, calculateRatingDelta } from "./index.js";

describe("rating helpers", () => {
  it("favors the higher-rated player", () => {
    expect(calculateExpectedScore(1400, 1000)).toBeGreaterThan(0.85);
  });

  it("returns a positive delta for the winner", () => {
    expect(calculateRatingDelta(1000, 1000)).toBe(16);
  });
});
