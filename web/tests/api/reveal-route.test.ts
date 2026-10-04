import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealFight } = vi.hoisted(() => ({ revealFight: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealFight }));

import * as route from "@/app/api/reveal/[fightId]/route";

const ID = "0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b11";
const call = (fightId: string) =>
  route.POST(new Request(`http://localhost/api/reveal/${fightId}`, { method: "POST" }), {
    params: Promise.resolve({ fightId }),
  });

const result = {
  outcome: "win",
  winnerFighterId: "w1",
  method: "KO/TKO",
  methodDetail: null,
  endRound: 1,
  endTimeSeconds: 30,
  scorecards: [],
  bonuses: [],
};

describe("POST /api/reveal/[fightId]", () => {
  let info: MockInstance<typeof console.info>;
  beforeEach(() => {
    revealFight.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("returns exactly one fight's result, never cached", async () => {
    revealFight.mockResolvedValue(result);
    const response = await call(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(revealFight).toHaveBeenCalledTimes(1);
    expect(revealFight).toHaveBeenCalledWith(ID);
  });

  it("rejects a malformed id before touching the database", async () => {
    for (const bad of ["not-a-uuid", "../etc/passwd", "1", ""]) {
      const response = await call(bad);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(revealFight).not.toHaveBeenCalled();
  });

  it("answers 404 with a generic body when there is no result", async () => {
    revealFight.mockResolvedValue(null);
    const response = await call(ID);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("answers 503 with a generic body when the database fails", async () => {
    revealFight.mockRejectedValue(new Error("boom with details"));
    const response = await call(ID);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only: no GET, no list, no bulk", () => {
    expect(Object.keys(route).filter((name) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name))).toEqual([]);
    expect(typeof route.POST).toBe("function");
  });

  it("logs only the route, the status and the fight id, never a result", async () => {
    revealFight.mockResolvedValue(result);
    await call(ID);
    expect(info).toHaveBeenCalled();
    for (const [line] of info.mock.calls) {
      const entry = JSON.parse(String(line)) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(["fightId", "route", "status"]);
      expect(String(line)).not.toMatch(/KO\/TKO|winner|method/i);
    }
  });

  it("is dynamic", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});
