import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { revealJudgeDisputes } = vi.hoisted(() => ({ revealJudgeDisputes: vi.fn() }));
vi.mock("@/lib/reveal/service", () => ({ revealJudgeDisputes }));

import * as route from "@/app/api/judges/[slug]/disputes/route";

const call = (slug: string) =>
  route.POST(new Request(`http://localhost/api/judges/${slug}/disputes`, { method: "POST" }), {
    params: Promise.resolve({ slug }),
  });

describe("POST /api/judges/[slug]/disputes", () => {
  let info: MockInstance<typeof console.info>;
  beforeEach(() => {
    revealJudgeDisputes.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it("returns one judge's cards, never cached", async () => {
    revealJudgeDisputes.mockResolvedValue([{ fightId: "f1" }]);
    const response = await call("ann-one");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ cards: [{ fightId: "f1" }] });
    expect(revealJudgeDisputes).toHaveBeenCalledWith("ann-one");
  });

  it("rejects a malformed slug before touching the database", async () => {
    for (const bad of ["Ann One", "../etc/passwd", "a--b", "%27"]) {
      const response = await call(bad);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(revealJudgeDisputes).not.toHaveBeenCalled();
  });

  it("answers 503 with a generic body when the database fails", async () => {
    revealJudgeDisputes.mockRejectedValue(new Error("boom with details"));
    const response = await call("ann-one");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("exports POST only and is dynamic", () => {
    expect(
      Object.keys(route).filter((name) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)),
    ).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("logs only the route, the status and the judge slug", async () => {
    revealJudgeDisputes.mockResolvedValue([{ fightId: "f1", winnerName: "Secret" }]);
    await call("ann-one");
    for (const [line] of info.mock.calls) {
      const entry = JSON.parse(String(line)) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(["route", "slug", "status"]);
      expect(String(line)).not.toMatch(/Secret|fightId/);
    }
  });
});
