import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealFighterResults } = vi.hoisted(() => ({ revealFighterResults: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealFighterResults }));

import * as route from "@/app/api/fighters/[slug]/results/route";
import { summarise } from "@/components/FighterFights";
import {
  FighterResultsParseError,
  FighterResultsRequestError,
  MAX_FIGHTER_RESULTS,
  fetchFighterResults,
  howDecided,
  parseResults,
  rowToResult,
  rowsToResults,
} from "@/lib/fighters/results";

const ID = "0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b11";
const row = { fight_id: ID, result: "win", method: "Decision - Split" };

describe("howDecided", () => {
  it("puts the source's method strings in a few plain words", () => {
    expect(howDecided("Decision - Unanimous")).toBe("Decision");
    expect(howDecided("U-DEC")).toBe("Decision");
    expect(howDecided("KO/TKO")).toBe("KO/TKO");
    expect(howDecided("TKO - Doctor's Stoppage")).toBe("KO/TKO");
    expect(howDecided("Submission")).toBe("Submission");
    expect(howDecided("DQ")).toBe("DQ");
  });

  it("says Other for anything it has not seen, never guessing", () => {
    expect(howDecided("Overturned")).toBe("Other");
    expect(howDecided(null)).toBe("Other");
    expect(howDecided(42)).toBe("Other");
  });
});

describe("rowToResult", () => {
  it("maps a row", () => {
    expect(rowToResult(row)).toEqual({ fightId: ID, outcome: "win", how: "Decision" });
  });

  it("refuses anything unexpected", () => {
    for (const bad of [
      { ...row, fight_id: "nope" },
      { ...row, fight_id: null },
      { ...row, result: "victory" },
      { ...row, result: null },
    ]) {
      expect(() => rowToResult(bad)).toThrow(FighterResultsParseError);
    }
  });

  it("refuses more rows than the database may send", () => {
    expect(() => rowsToResults(Array.from({ length: MAX_FIGHTER_RESULTS + 1 }, () => row))).toThrow(
      FighterResultsParseError,
    );
  });
});

describe("parseResults and fetchFighterResults", () => {
  it("accepts the results the route sends and rejects error bodies", () => {
    const result = rowToResult(row);
    expect(parseResults({ results: [result] })).toEqual([result]);
    expect(() => parseResults({ error: "not_found" })).toThrow(FighterResultsParseError);
    expect(() => parseResults({ results: [{ ...result, outcome: "x" }] })).toThrow(FighterResultsParseError);
  });

  it("asks with POST for one fighter, never cached, and refuses a bad slug before asking", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [rowToResult(row)] }) });
    expect(await fetchFighterResults("ann-one", ok as unknown as typeof fetch)).toHaveLength(1);
    expect(ok).toHaveBeenCalledWith("/api/fighters/ann-one/results", { method: "POST", cache: "no-store" });
    await expect(fetchFighterResults("Bad Slug!", ok as unknown as typeof fetch)).rejects.toBeInstanceOf(
      FighterResultsParseError,
    );
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchFighterResults("ann-one", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(
      FighterResultsRequestError,
    );
  });
});

describe("summarise", () => {
  const r = (outcome: "win" | "loss" | "draw" | "no_contest") => ({ fightId: ID, outcome, how: "Decision" });
  it("counts each kind in one sentence", () => {
    expect(summarise([r("win"), r("win"), r("loss")])).toBe("Won 2, lost 1.");
    expect(summarise([r("win"), r("draw"), r("no_contest")])).toBe("Won 1, lost 0, 1 draw, 1 no contest.");
  });
});

describe("POST /api/fighters/[slug]/results", () => {
  let info: MockInstance<typeof console.info>;
  const call = (slug: string) =>
    route.POST(new Request(`http://localhost/api/fighters/${slug}/results`, { method: "POST" }), {
      params: Promise.resolve({ slug }),
    });
  beforeEach(() => {
    revealFighterResults.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("serves one fighter's results, never cached", async () => {
    revealFighterResults.mockResolvedValue([rowToResult(row)]);
    const response = await call("ann-one");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).results).toHaveLength(1);
    expect(revealFighterResults).toHaveBeenCalledWith("ann-one");
  });

  it("rejects a bad slug first and answers 404 and 503 generically", async () => {
    expect((await call("Bad Slug!")).status).toBe(400);
    expect(revealFighterResults).not.toHaveBeenCalled();
    revealFighterResults.mockResolvedValue([]);
    expect((await call("nobody")).status).toBe(404);
    revealFighterResults.mockRejectedValue(new Error("boom with details"));
    const failed = await call("ann-one");
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only, is dynamic and logs no name, fight or result", async () => {
    expect(Object.keys(route).filter((n) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
    revealFighterResults.mockResolvedValue([rowToResult(row)]);
    await call("ann-one");
    for (const [line] of info.mock.calls) {
      expect(Object.keys(JSON.parse(String(line))).sort()).toEqual(["route", "status"]);
      expect(String(line)).not.toMatch(/ann-one|Decision|win/);
    }
  });
});
