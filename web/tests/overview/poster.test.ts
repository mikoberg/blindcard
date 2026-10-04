import { describe, expect, it } from "vitest";
import { barHeight, hashName, posterArt, POSTER_PALETTE_SIZE } from "@/lib/overview/poster";

describe("posterArt", () => {
  it("is deterministic: the same name always gives the same art", () => {
    expect(posterArt("Fight Night: Alpha vs. Beta")).toEqual(posterArt("Fight Night: Alpha vs. Beta"));
  });

  it("uses the whole palette and gives different names different art", () => {
    const names = Array.from({ length: 200 }, (_, i) => `Event number ${i}`);
    expect(new Set(names.map((n) => posterArt(n).ground)).size).toBe(POSTER_PALETTE_SIZE);
    expect(new Set(names.map((n) => posterArt(n).cut)).size).toBeGreaterThan(20);
  });

  it("spreads events evenly over the palette (no colour dominates)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 800; i++) {
      const { ground } = posterArt(`Fight Night: Fighter ${i} vs. Fighter ${i + 1}`);
      counts.set(ground, (counts.get(ground) ?? 0) + 1);
    }
    expect(counts.size).toBe(POSTER_PALETTE_SIZE);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800 / POSTER_PALETTE_SIZE / 1.6);
      expect(count).toBeLessThan((800 / POSTER_PALETTE_SIZE) * 1.6);
    }
  });

  it("produces a valid clip-path polygon with percentages inside the box", () => {
    for (let i = 0; i < 100; i++) {
      const { cut } = posterArt(`Event ${i}`);
      expect(cut).toMatch(/^polygon\(.+\)$/);
      for (const match of cut.matchAll(/(\d+)%/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(0);
        expect(Number(match[1])).toBeLessThanOrEqual(100);
      }
    }
  });

  it("handles an empty name", () => {
    expect(posterArt("").ground).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("hashName", () => {
  it("is stable (FNV-1a reference values)", () => {
    expect(hashName("")).toBe(0x811c9dc5);
    expect(hashName("a")).toBe(0xe40c292c);
  });
});

describe("barHeight", () => {
  it("grows with the rating and stays inside the strip", () => {
    expect(barHeight(1)).toBe(14);
    expect(barHeight(5)).toBe(100);
    expect(barHeight(3)).toBe(57);
    expect(barHeight(4.5)).toBeGreaterThan(barHeight(4));
    expect(barHeight(0)).toBe(14);
    expect(barHeight(9)).toBe(100);
  });
});
