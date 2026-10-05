import { describe, expect, it } from "vitest";
import { cleanSearchTerm, containsPattern } from "@/lib/leaderboard/search";
import { toSearchResults } from "@/lib/leaderboard/rank";

describe("cleanSearchTerm", () => {
  it("trims, collapses spaces and bounds the length", () => {
    expect(cleanSearchTerm("  cub   swanson ")).toBe("cub swanson");
    expect(cleanSearchTerm("x".repeat(80))).toHaveLength(50);
  });

  it("needs at least two characters", () => {
    expect(cleanSearchTerm("c")).toBeNull();
    expect(cleanSearchTerm("   ")).toBeNull();
    expect(cleanSearchTerm("cu")).toBe("cu");
  });
});

describe("pattern characters", () => {
  it("never widen the search: they are removed, so a search for them is no search", () => {
    expect(cleanSearchTerm("%_")).toBeNull();
    expect(cleanSearchTerm("*")).toBeNull();
    expect(cleanSearchTerm("cu%b")).toBe("cu b");
    expect(containsPattern(cleanSearchTerm("c_ub\\")!)).toBe("%c ub%");
  });
});

describe("toSearchResults", () => {
  it("keeps anyone with a rated fight, ranked or not, and drops unusable rows", () => {
    const rows = [
      { id: "a", slug: "a", name: "Ann", country: null, rated_fights: 2, avg_stars: "3.5" },
      { id: "b", slug: "b", name: "Bea", country: "nl", rated_fights: 0, avg_stars: 4 },
      { id: "c", slug: "c", name: "Cid", country: null, rated_fights: 9, avg_stars: "nope" },
    ];
    expect(toSearchResults(rows)).toEqual([
      { slug: "a", name: "Ann", country: null, fights: 2, average: 3.5 },
    ]);
  });
});
