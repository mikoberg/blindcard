import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActiveFighterBoard } from "@/components/ActiveFighterBoard";
import { FighterTabs } from "@/components/FighterTabs";
import { ACTIVE_DAYS, activeOnly, isActive } from "@/lib/leaderboard/active";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";

const TODAY = "2026-10-06";
const entry = (id: string, rank: number, lastFight: string | null): LeaderboardEntry => ({
  rank,
  id,
  slug: id,
  name: `Fighter ${id}`,
  country: null,
  fights: 10,
  average: 4,
  lastFight,
});

describe("isActive", () => {
  it("counts a fight within the last two years", () => {
    expect(isActive("2026-09-01", TODAY)).toBe(true);
    expect(isActive("2024-10-06", TODAY)).toBe(true); // exactly 730 days back
    expect(isActive("2024-10-05", TODAY)).toBe(false);
    expect(ACTIVE_DAYS).toBe(730);
  });

  it("is false for 2007, for no date and for anything that is not a date", () => {
    expect(isActive("2007-06-01", TODAY)).toBe(false);
    expect(isActive(null, TODAY)).toBe(false);
    expect(isActive(undefined, TODAY)).toBe(false);
    expect(isActive("soon", TODAY)).toBe(false);
    expect(isActive("2026-09-01", "today")).toBe(false);
  });
});

describe("activeOnly", () => {
  const all = [entry("a", 1, "2007-01-01"), entry("b", 2, "2026-06-01"), entry("c", 3, null), entry("d", 4, "2025-12-01")];

  it("keeps the active fighters in order and numbers them again from 1", () => {
    expect(activeOnly(all, TODAY).map((e) => [e.id, e.rank])).toEqual([
      ["b", 1],
      ["d", 2],
    ]);
  });

  it("leaves the input alone", () => {
    activeOnly(all, TODAY);
    expect(all.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("ActiveFighterBoard", () => {
  const all = [entry("old", 1, "2007-01-01"), entry("new", 2, "2026-06-01")];

  it("opens on the active fighters and says how many there are on each side", () => {
    const html = renderToStaticMarkup(<ActiveFighterBoard entries={all} today={TODAY} />);
    expect(html).toContain("Fighter new");
    expect(html).not.toContain("Fighter old");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Active");
    expect(html).toContain("All since 2001");
  });

  it("says so when nobody is active", () => {
    const html = renderToStaticMarkup(<ActiveFighterBoard entries={[entry("old", 1, "2007-01-01")]} today={TODAY} />);
    expect(html).toContain("No active fighters to rank yet.");
  });
});

describe("FighterTabs", () => {
  it("links both lists and marks the one you are on", () => {
    const watch = renderToStaticMarkup(<FighterTabs active="watch" />);
    expect(watch).toContain('href="/fighters"');
    expect(watch).toContain('href="/fighters/elo"');
    expect(watch.match(/aria-current="page"/g)).toHaveLength(1);
    expect(watch).toContain("spoilers");
    const elo = renderToStaticMarkup(<FighterTabs active="elo" />);
    expect(elo).toMatch(/<a[^>]*aria-current="page"[^>]*>\s*Strongest/);
    expect(watch).toMatch(/<a[^>]*aria-current="page"[^>]*>\s*Worth watching/);
  });
});
