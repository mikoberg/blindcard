import { beforeEach, describe, expect, it, vi } from "vitest";

const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabase: () => ({
    from: () => ({ select: () => ({ order: () => ({ order: () => ({ range }) }) }) }),
  }),
}));

import { listEventSummaries } from "@/lib/data/overview";

const row = (id: string) => ({
  id,
  slug: id,
  name: `Event ${id}`,
  event_date: "2026-01-02",
  location: null,
  main_event_a: "A One",
  main_event_b: "B Two",
  main_event_title: false,
  ratings: [],
});
const page = (ids: string[]) => ({ data: ids.map(row), error: null });

describe("listEventSummaries", () => {
  beforeEach(() => range.mockReset());

  it("reads page after page until an empty page, advancing by what came back", async () => {
    // The server hands out fewer rows than asked for (a lower row limit): nothing may be lost.
    range
      .mockResolvedValueOnce(page(["a", "b"]))
      .mockResolvedValueOnce(page(["c"]))
      .mockResolvedValueOnce(page([]));
    const events = await listEventSummaries();
    expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(range.mock.calls.map((call) => call[0])).toEqual([0, 2, 3]);
  });

  it("returns an empty list for an empty view", async () => {
    range.mockResolvedValueOnce(page([]));
    expect(await listEventSummaries()).toEqual([]);
  });

  it("skips unusable rows but keeps the rest", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    range
      .mockResolvedValueOnce({ data: [row("a"), { ...row("bad"), event_date: "x" }], error: null })
      .mockResolvedValueOnce(page([]));
    expect((await listEventSummaries()).map((e) => e.id)).toEqual(["a"]);
  });

  it("fails with a short code when the database errors", async () => {
    range.mockResolvedValueOnce({ data: null, error: { code: "42P01" } });
    await expect(listEventSummaries()).rejects.toThrow(/42P01/);
  });
});
