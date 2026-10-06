import { describe, expect, it, vi } from "vitest";

const { listExploreEvents } = vi.hoisted(() => ({ listExploreEvents: vi.fn() }));
vi.mock("@/lib/data/explore", () => ({ listExploreEvents }));

import * as route from "@/app/api/explore/route";

describe("GET /api/explore", () => {
  it("serves the public data with a shared cache, and exports GET only", async () => {
    listExploreEvents.mockResolvedValue([{ id: "e1" }]);
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(await response.json()).toEqual({ events: [{ id: "e1" }] });
    expect(Object.keys(route).filter((name) => /^(POST|PUT|PATCH|DELETE)$/.test(name))).toEqual([]);
  });

  it("answers 503 and caches nothing when the database fails", async () => {
    listExploreEvents.mockRejectedValue(new Error("boom"));
    const response = await route.GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
