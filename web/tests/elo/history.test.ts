import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealEloHistory } = vi.hoisted(() => ({ revealEloHistory: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealEloHistory }));

import * as route from "@/app/api/elo/[slug]/route";
import {
  EloHistoryParseError,
  EloHistoryRequestError,
  MAX_ELO_STEPS,
  fetchEloHistory,
  parseHistory,
  rowToStep,
  rowsToSteps,
} from "@/lib/elo/history";

const row = {
  seq: 3,
  fight_date: "2026-08-15",
  event_name: "Event X",
  opponent_name: "Ben Two",
  opponent_slug: "ben-two",
  score: "0.667",
  how: "won by split decision",
  rating_before: "1700.0",
  opponent_rating: "1650.5",
  expected: "0.5712",
  k: "37.5",
  change: "3.6",
  rating_after: "1703.6",
};

describe("rowToStep", () => {
  it("maps a row and reads numbers sent as text", () => {
    expect(rowToStep(row)).toEqual({
      seq: 3,
      date: "2026-08-15",
      eventName: "Event X",
      opponent: "Ben Two",
      opponentSlug: "ben-two",
      score: 0.667,
      how: "won by split decision",
      ratingBefore: 1700,
      opponentRating: 1650.5,
      expected: 0.5712,
      k: 37.5,
      change: 3.6,
      ratingAfter: 1703.6,
    });
  });

  it("keeps an opponent without a valid slug as plain text", () => {
    expect(rowToStep({ ...row, opponent_slug: "Bad Slug!" }).opponentSlug).toBeNull();
  });

  it("refuses anything unexpected instead of guessing", () => {
    for (const bad of [
      { ...row, seq: 0 },
      { ...row, score: 1.5 },
      { ...row, expected: -0.1 },
      { ...row, fight_date: "soon" },
      { ...row, how: "" },
      { ...row, k: "big" },
    ]) {
      expect(() => rowToStep(bad)).toThrow(EloHistoryParseError);
    }
  });

  it("refuses more rows than the database may send", () => {
    expect(() => rowsToSteps(Array.from({ length: MAX_ELO_STEPS + 1 }, () => row))).toThrow(EloHistoryParseError);
  });
});

describe("parseHistory and fetchEloHistory", () => {
  it("accepts the steps the route sends and rejects error bodies", () => {
    const step = rowToStep(row);
    expect(parseHistory({ steps: [step] })).toEqual([step]);
    expect(() => parseHistory({ error: "not_found" })).toThrow(EloHistoryParseError);
    expect(() => parseHistory({ steps: [{ ...step, date: "soon" }] })).toThrow(EloHistoryParseError);
  });

  it("asks with POST for one fighter, never cached", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ steps: [rowToStep(row)] }) });
    expect(await fetchEloHistory("ann-one", ok as unknown as typeof fetch)).toHaveLength(1);
    expect(ok).toHaveBeenCalledWith("/api/elo/ann-one", { method: "POST", cache: "no-store" });
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchEloHistory("ann-one", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(
      EloHistoryRequestError,
    );
  });
});

describe("POST /api/elo/[slug]", () => {
  let info: MockInstance<typeof console.info>;
  const call = (slug: string) =>
    route.POST(new Request(`http://localhost/api/elo/${slug}`, { method: "POST" }), { params: Promise.resolve({ slug }) });
  beforeEach(() => {
    revealEloHistory.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("serves one fighter's steps, never cached", async () => {
    revealEloHistory.mockResolvedValue([rowToStep(row)]);
    const response = await call("ann-one");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).steps).toHaveLength(1);
    expect(revealEloHistory).toHaveBeenCalledWith("ann-one");
  });

  it("rejects a bad slug before touching the database, and answers 404 and 503 generically", async () => {
    expect((await call("Bad Slug!")).status).toBe(400);
    expect(revealEloHistory).not.toHaveBeenCalled();
    revealEloHistory.mockResolvedValue([]);
    expect((await call("nobody")).status).toBe(404);
    revealEloHistory.mockRejectedValue(new Error("boom with details"));
    const failed = await call("ann-one");
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only, is dynamic and logs no name or rating", async () => {
    expect(Object.keys(route).filter((n) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
    revealEloHistory.mockResolvedValue([rowToStep(row)]);
    await call("ann-one");
    for (const [line] of info.mock.calls) {
      expect(Object.keys(JSON.parse(String(line))).sort()).toEqual(["route", "status"]);
      expect(String(line)).not.toMatch(/Ben Two|1703|ann-one/);
    }
  });
});
