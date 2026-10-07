import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealEloBoard } = vi.hoisted(() => ({ revealEloBoard: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealEloBoard }));

import * as route from "@/app/api/elo/route";
import EloPage from "@/app/fighters/elo/page";
import { EloBoard } from "@/components/EloBoard";
import {
  EloParseError,
  EloRequestError,
  MAX_ELO_ROWS,
  fetchEloBoard,
  parseBoard,
  rowToEntry,
  rowsToEntries,
} from "@/lib/elo/board";
import { findLeaks, HTML_LEAK_PATTERNS } from "../spoiler/leaks";

const row = {
  rank: 1,
  name: "Ann One",
  slug: "ann-one",
  country: "us",
  rating: "1712.4",
  fights: 12,
  last_fight: "2026-08-15",
  peak: "1750.2",
  peak_date: "2025-03-01",
};

describe("rowToEntry", () => {
  it("maps a row, reading numbers sent as text", () => {
    expect(rowToEntry(row)).toEqual({
      rank: 1,
      name: "Ann One",
      slug: "ann-one",
      country: "us",
      rating: 1712.4,
      fights: 12,
      lastFight: "2026-08-15",
      peak: 1750.2,
      peakDate: "2025-03-01",
    });
  });

  it("keeps a fighter without a valid slug, but not as a link", () => {
    expect(rowToEntry({ ...row, slug: "Not A Slug!" }).slug).toBeNull();
    expect(rowToEntry({ ...row, slug: null, country: null })).toMatchObject({ slug: null, country: null });
  });

  it("refuses anything unexpected instead of guessing", () => {
    for (const bad of [
      { ...row, rank: 0 },
      { ...row, rank: 1.5 },
      { ...row, name: "" },
      { ...row, rating: "high" },
      { ...row, fights: 0 },
      { ...row, last_fight: "yesterday" },
      { ...row, peak: "1000" }, // a peak below the current rating cannot be
      { ...row, peak_date: "someday" },
    ]) {
      expect(() => rowToEntry(bad)).toThrow(EloParseError);
    }
  });

  it("refuses more rows than the database may send", () => {
    expect(() => rowsToEntries(Array.from({ length: MAX_ELO_ROWS + 1 }, () => row))).toThrow(EloParseError);
  });
});

describe("parseBoard and fetchEloBoard", () => {
  it("accepts the entries the route sends and rejects error bodies", () => {
    const entry = rowToEntry(row);
    expect(parseBoard({ board: [entry] })).toEqual([entry]);
    expect(() => parseBoard({ board: [{ ...entry, lastFight: "soon" }] })).toThrow(EloParseError);
    expect(() => parseBoard({ error: "unavailable" })).toThrow(EloParseError);
    expect(() => parseBoard(null)).toThrow(EloParseError);
  });

  it("asks with POST, never cached, and fails on a bad status", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ board: [rowToEntry(row)] }) });
    expect(await fetchEloBoard("active", ok as unknown as typeof fetch)).toHaveLength(1);
    expect(ok).toHaveBeenCalledWith("/api/elo", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await fetchEloBoard("inactive", ok as unknown as typeof fetch);
    expect(ok).toHaveBeenLastCalledWith("/api/elo", expect.objectContaining({ body: JSON.stringify({ status: "inactive" }) }));
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchEloBoard("active", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(EloRequestError);
  });
});

describe("POST /api/elo", () => {
  let info: MockInstance<typeof console.info>;
  beforeEach(() => {
    revealEloBoard.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("serves the board, never cached", async () => {
    revealEloBoard.mockResolvedValue([rowToEntry(row)]);
    const response = await route.POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).board).toHaveLength(1);
  });

  it("passes on which fighters were asked for, active by default, and refuses anything else", async () => {
    revealEloBoard.mockResolvedValue([rowToEntry(row)]);
    const post = (body: unknown) =>
      route.POST(new Request("http://localhost/api/elo", { method: "POST", body: JSON.stringify(body) }));
    await post({});
    expect(revealEloBoard).toHaveBeenLastCalledWith("active");
    await post({ status: "inactive" });
    expect(revealEloBoard).toHaveBeenLastCalledWith("inactive");
    await post({ status: "all" });
    expect(revealEloBoard).toHaveBeenLastCalledWith("all");
    revealEloBoard.mockClear();
    expect((await post({ status: "retired" })).status).toBe(400);
    expect((await post({ status: 5 })).status).toBe(400);
    expect(revealEloBoard).not.toHaveBeenCalled();
    // no body at all (an old client) still gets the active list
    const bare = await route.POST(new Request("http://localhost/api/elo", { method: "POST" }));
    expect(bare.status).toBe(200);
    expect(revealEloBoard).toHaveBeenLastCalledWith("active");
  });

  it("answers a generic 503 without details", async () => {
    revealEloBoard.mockRejectedValue(new Error("boom with details"));
    const response = await route.POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only, is dynamic and logs no name or rating", async () => {
    expect(Object.keys(route).filter((n) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
    revealEloBoard.mockResolvedValue([rowToEntry(row)]);
    await route.POST();
    for (const [line] of info.mock.calls) {
      expect(Object.keys(JSON.parse(String(line))).sort()).toEqual(["route", "status"]);
      expect(String(line)).not.toMatch(/Ann One|1712/);
    }
  });
});

describe("the Elo page as first rendered", () => {
  it("holds no fighter and no rating: the list is fetched by the browser, never rendered with the page", () => {
    const html = renderToStaticMarkup(<EloBoard />);
    expect(html).toContain("Loading the list");
    expect(html).toContain("Active");
    expect(html).toContain("Inactive");
    expect(html).not.toContain("<li");
    expect(html).not.toMatch(/Spoilers ahead|Unlock/);
  });

  it("carries no result wording in the page itself", () => {
    const html = renderToStaticMarkup(<EloPage />);
    expect(findLeaks(html, HTML_LEAK_PATTERNS)).toEqual([]);
    expect(html).toContain("not betting advice");
  });
});
