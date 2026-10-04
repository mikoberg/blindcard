import { describe, expect, it } from "vitest";
import { isValidSlug } from "@/lib/data/events";

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    for (const ok of ["ufc-300-pereira-vs-hill", "event", "a-1", "x".repeat(200)]) {
      expect(isValidSlug(ok)).toBe(true);
    }
  });

  it("rejects anything else, so odd paths never reach the database", () => {
    for (const bad of ["", "-a", "a-", "a--b", "A-b", "a b", "a/b", "a%20b", "ä", "x".repeat(201), "..", "a_b"]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});
