import { describe, expect, it } from "vitest";
import { classicsByYear, toClassics } from "@/lib/classics/group";
import type { FightRatingRow } from "@/lib/classics/types";

const row = (id: string, date: string, stars: number | string, slug = "event-one"): FightRatingRow => ({
  fight_id: id,
  event_slug: slug,
  event_name: "Event",
  event_date: date,
  fighter_a_name: "Ann",
  fighter_b_name: "Bea",
  weight_class: "Lightweight",
  is_title_fight: false,
  stars,
});

describe("toClassics", () => {
  it("keeps only five-star fights, newest first", () => {
    const out = toClassics([row("a", "2024-01-01", 5), row("b", "2025-05-05", "5.0"), row("c", "2025-06-06", 4.5)]);
    expect(out.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("drops rows with an unusable event slug", () => {
    expect(toClassics([row("a", "2024-01-01", 5, "Bad Slug!")])).toEqual([]);
  });
});

describe("videos on the classics", () => {
  it("attaches a valid video id to its fight and ignores a bad one", () => {
    const out = toClassics(
      [row("a", "2024-01-01", 5), row("b", "2025-01-01", 5)],
      [
        { fight_id: "a", youtube_id: "dQw4w9WgXcQ" },
        { fight_id: "b", youtube_id: "nope" },
      ],
    );
    expect(out.find((f) => f.id === "a")?.videoId).toBe("dQw4w9WgXcQ");
    expect(out.find((f) => f.id === "b")?.videoId).toBeNull();
  });
});

describe("classicsByYear", () => {
  it("groups by year, keeping the newest-first order", () => {
    const groups = classicsByYear(
      toClassics([row("a", "2025-01-01", 5), row("b", "2025-03-01", 5), row("c", "2023-02-02", 5)]),
    );
    expect(groups.map((g) => [g.year, g.fights.map((f) => f.id)])).toEqual([
      ["2025", ["b", "a"]],
      ["2023", ["c"]],
    ]);
  });
});
