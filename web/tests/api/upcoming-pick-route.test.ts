import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealUpcomingPick } = vi.hoisted(() => ({ revealUpcomingPick: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealUpcomingPick }));

import * as route from "@/app/api/upcoming/[bout]/pick/route";

const ID = "0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b11";
const call = (bout: string) =>
  route.POST(new Request(`http://localhost/api/upcoming/${bout}/pick`, { method: "POST" }), {
    params: Promise.resolve({ bout }),
  });
const pick = { favoured: "a", probability: 0.61, basis: "both", accuracy: 0.57 };

describe("POST /api/upcoming/[bout]/pick", () => {
  let info: MockInstance<typeof console.info>;
  beforeEach(() => {
    revealUpcomingPick.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("returns one bout's pick, never cached", async () => {
    revealUpcomingPick.mockResolvedValue(pick);
    const response = await call(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ pick });
    expect(revealUpcomingPick).toHaveBeenCalledWith(ID);
  });

  it("rejects a malformed id before touching the database", async () => {
    for (const bad of ["nope", "../x", "1", ""]) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(revealUpcomingPick).not.toHaveBeenCalled();
  });

  it("answers 404 and 503 with generic bodies", async () => {
    revealUpcomingPick.mockResolvedValue(null);
    const missing = await call(ID);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
    revealUpcomingPick.mockRejectedValue(new Error("boom with details"));
    const failed = await call(ID);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only, is dynamic and logs no pick", async () => {
    expect(Object.keys(route).filter((n) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
    revealUpcomingPick.mockResolvedValue(pick);
    await call(ID);
    for (const [line] of info.mock.calls) {
      const entry = JSON.parse(String(line)) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(["boutId", "route", "status"]);
      expect(String(line)).not.toMatch(/favoured|probability|0\.61/);
    }
  });
});
