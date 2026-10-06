import { describe, expect, it, vi } from "vitest";
import { ExploreLoadError, fetchExploreEvents, parseExploreEvents } from "@/lib/explore/client";
import { toFacets, type FacetRow } from "@/lib/explore/facets";
import {
  ExploreParseError,
  ExploreRequestError,
  MAX_EVENT_ROWS,
  fetchEventResults,
  parseResults,
  rowToResults,
  rowsToResults,
  type EventResultRow,
} from "@/lib/explore/stats";

const ID = "86954dde-380e-4775-80f2-f8e496dfd6a3";

const row = (patch: Partial<EventResultRow> = {}): EventResultRow => ({
  event_id: ID,
  fights: 12,
  knockouts: 6,
  submissions: 2,
  decisions: 3,
  split_decisions: 1,
  round_one_finishes: 3,
  total_seconds: 6722,
  longest_seconds: 1298,
  fastest_finish_seconds: 57,
  bonuses: 3,
  upsets: 0,
  knockdowns: 7,
  strikes: 817,
  takedowns: 25,
  sub_attempts: 12,
  control_seconds: 2507,
  ...patch,
});

describe("rowToResults", () => {
  it("maps a database row", () => {
    const { id, results } = rowToResults(row());
    expect(id).toBe(ID);
    expect(results).toMatchObject({ fights: 12, knockouts: 6, totalSeconds: 6722, fastestFinishSeconds: 57, subAttempts: 12 });
  });

  it("accepts numbers sent as strings and a card without a finish", () => {
    expect(rowToResults(row({ knockouts: "6", fastest_finish_seconds: null })).results).toMatchObject({
      knockouts: 6,
      fastestFinishSeconds: null,
    });
  });

  it("rejects anything unexpected instead of guessing", () => {
    for (const bad of [
      row({ event_id: "x" }),
      row({ fights: 0 }),
      row({ knockouts: -1 }),
      row({ knockouts: 1.5 }),
      row({ total_seconds: null }),
      row({ split_decisions: 9 }), // more split decisions than decisions
      row({ knockouts: 9, submissions: 9 }), // more finishes than fights
    ]) {
      expect(() => rowToResults(bad)).toThrow(ExploreParseError);
    }
  });

  it("refuses more rows than the database may send", () => {
    expect(() => rowsToResults(Array.from({ length: MAX_EVENT_ROWS + 1 }, () => row()))).toThrow(ExploreParseError);
  });
});

describe("what the browser receives", () => {
  it("parses what the route sends and rejects error bodies", () => {
    const sent = { results: { [ID]: rowToResults(row()).results } };
    expect(parseResults(sent)[ID]).toEqual(sent.results[ID]);
    for (const bad of [null, "x", {}, { error: "unavailable" }, { results: [] }, { results: { [ID]: { fights: 1 } } }]) {
      expect(() => parseResults(bad)).toThrow(ExploreParseError);
    }
  });

  it("asks for the results with a POST that is never cached", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ results: {} }));
    expect(await fetchEventResults(fetchImpl as unknown as typeof fetch)).toEqual({});
    expect(fetchImpl).toHaveBeenCalledWith("/api/explore/results", { method: "POST", cache: "no-store" });
    const failing = vi.fn(async () => new Response("no", { status: 503 }));
    await expect(fetchEventResults(failing as unknown as typeof fetch)).rejects.toBeInstanceOf(ExploreRequestError);
  });
});

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
