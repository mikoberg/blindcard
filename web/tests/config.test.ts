import { describe, expect, it } from "vitest";
import { CONFIG } from "@/lib/config";

describe("CONFIG", () => {
  it("matches the spec thresholds", () => {
    expect(CONFIG.watchThese).toEqual({ minStars: 4.0, maxItems: 3 });
    expect(CONFIG.hiddenGem).toEqual({ minStars: 4.0, minCardPosition: 6 });
  });
});
