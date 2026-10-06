import { describe, expect, it, vi } from "vitest";
import { ExploreLoadError, fetchExploreEvents, parseExploreEvents } from "@/lib/explore/client";
import { toFacets, type FacetRow } from "@/lib/explore/facets";

const ID = "86954dde-380e-4775-80f2-f8e496dfd6a3";

const FACT_ROW: FacetRow = {
  event_id: ID,
  title_fights: 2,
  five_round_fights: 3,
  womens_fights: 3,
  rematches: 1,
  longest_streak: 6,
  even_fights: 4,
  elo_gap_avg: 31,
  elo_avg: 1563,
  elo_peak: 1650,
  ranked_fighters: 4,
  champions: 0,
  top5_fighters: 2,
  ranked_bouts: 1,
  weight_classes: ["Bantamweight", "Lightweight"],
  countries: ["us", "br", "USA", 3],
};

describe("toFacets", () => {
  it("maps the public view row and keeps only real country codes", () => {
    const facets = toFacets(FACT_ROW);
    expect(facets).toMatchObject({ titleFights: 2, eloAvg: 1563, rankedBouts: 1, weightClasses: ["Bantamweight", "Lightweight"] });
    expect(facets?.countries).toEqual(["us", "br"]);
  });

  it("allows an event without an Elo, and returns null for a row of the wrong shape", () => {
    expect(toFacets({ ...FACT_ROW, elo_avg: null, elo_peak: null, elo_gap_avg: null })).toMatchObject({ eloAvg: null, eloGapAvg: null });
    expect(toFacets({ ...FACT_ROW, title_fights: "many" })).toBeNull();
    expect(toFacets({ ...FACT_ROW, champions: -1 })).toBeNull();
  });
});

describe("parseExploreEvents", () => {
  const event = { id: "e1", slug: "ufc-1", name: "UFC 1", eventDate: "1993-11-12", location: null, mainEvent: null, ratings: [], facets: null };

  it("reads the public events and treats odd facets as missing", () => {
    const [parsed] = parseExploreEvents({ events: [{ ...event, facets: { nope: true } }] });
    expect(parsed).toMatchObject({ id: "e1", location: null, facets: null });
  });

  it("rejects a body that is not the list", () => {
    for (const bad of [null, {}, { events: [{ id: 1 }] }, { events: [{ ...event, eventDate: "yesterday" }] }]) {
      expect(() => parseExploreEvents(bad)).toThrow(ExploreLoadError);
    }
  });

  it("fetches with a plain GET and fails on a bad status", async () => {
    const ok = vi.fn(async () => Response.json({ events: [event] }));
    expect(await fetchExploreEvents(ok as unknown as typeof fetch)).toHaveLength(1);
    expect(ok).toHaveBeenCalledWith("/api/explore");
    const bad = vi.fn(async () => new Response("no", { status: 503 }));
    await expect(fetchExploreEvents(bad as unknown as typeof fetch)).rejects.toBeInstanceOf(ExploreLoadError);
  });
});
