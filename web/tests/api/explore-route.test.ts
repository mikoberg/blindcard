import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealEventResults, listExploreEvents } = vi.hoisted(() => ({
  revealEventResults: vi.fn(),
  listExploreEvents: vi.fn(),
}));
vi.mock("@/lib/reveal/service", () => ({ revealEventResults }));
vi.mock("@/lib/data/explore", () => ({ listExploreEvents }));

import * as publicRoute from "@/app/api/explore/route";
import * as resultsRoute from "@/app/api/explore/results/route";

describe("POST /api/explore/results", () => {
  let info: MockInstance<typeof console.info>;
  beforeEach(() => {
    revealEventResults.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("returns the result facets, never cached", async () => {
    revealEventResults.mockResolvedValue({ e1: { fights: 12 } });
    const response = await resultsRoute.POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ results: { e1: { fights: 12 } } });
  });

  it("answers 503 with a generic body when the database fails", async () => {
    revealEventResults.mockRejectedValue(new Error("boom with details"));
    const response = await resultsRoute.POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only and is dynamic, so it is never prefetched", () => {
    expect(Object.keys(resultsRoute).filter((name) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name))).toEqual([]);
    expect(resultsRoute.dynamic).toBe("force-dynamic");
  });

  it("logs only the route and the status", async () => {
    revealEventResults.mockResolvedValue({ e1: { fights: 12, knockouts: 99 } });
    await resultsRoute.POST();
    for (const [line] of info.mock.calls) {
      expect(Object.keys(JSON.parse(String(line)) as object).sort()).toEqual(["route", "status"]);
      expect(String(line)).not.toMatch(/knockouts|99/);
    }
  });
});

describe("GET /api/explore", () => {
  it("serves the public data with a shared cache, and exports GET only", async () => {
    listExploreEvents.mockResolvedValue([{ id: "e1" }]);
    const response = await publicRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(await response.json()).toEqual({ events: [{ id: "e1" }] });
    expect(Object.keys(publicRoute).filter((name) => /^(POST|PUT|PATCH|DELETE)$/.test(name))).toEqual([]);
  });

  it("answers 503 and caches nothing when the database fails", async () => {
    listExploreEvents.mockRejectedValue(new Error("boom"));
    const response = await publicRoute.GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
