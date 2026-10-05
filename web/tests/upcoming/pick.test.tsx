import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UpcomingPick } from "@/components/UpcomingPick";
import { UpcomingView } from "@/components/UpcomingView";
import {
  PickParseError,
  PickRequestError,
  fetchPick,
  isTossUp,
  parsePick,
  rowToPick,
} from "@/lib/upcoming/pick";
import type { UpcomingEvent } from "@/lib/upcoming/types";

const row = { favoured: "b", probability: "0.612", basis: "both", accuracy: "0.561" };

describe("rowToPick and parsePick", () => {
  it("reads a pick and accepts numeric strings from the database", () => {
    expect(rowToPick(row)).toEqual({ favoured: "b", probability: 0.612, basis: "both", accuracy: 0.561 });
    expect(parsePick({ pick: rowToPick(row) }).favoured).toBe("b");
  });

  it("rejects odd shapes, a probability under one half and error bodies", () => {
    expect(() => rowToPick({ ...row, favoured: "c" })).toThrow(PickParseError);
    expect(() => rowToPick({ ...row, probability: 0.4 })).toThrow(PickParseError);
    expect(() => rowToPick({ ...row, basis: "none" })).toThrow(PickParseError);
    expect(() => parsePick({ error: "unavailable" })).toThrow(PickParseError);
    expect(() => parsePick(null)).toThrow(PickParseError);
  });

  it("calls anything under 55% a toss-up", () => {
    expect(isTossUp(rowToPick({ ...row, probability: 0.52 }))).toBe(true);
    expect(isTossUp(rowToPick(row))).toBe(false);
    // 54.6% shows as 55%, which is not called a toss-up
    expect(isTossUp(rowToPick({ ...row, probability: 0.546 }))).toBe(false);
    expect(isTossUp(rowToPick({ ...row, probability: 0.544 }))).toBe(true);
  });
});

describe("fetchPick", () => {
  it("POSTs without caching for one bout and validates the answer", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ pick: rowToPick(row) }));
    const pick = await fetchPick("b-1", fetchImpl as unknown as typeof fetch);
    expect(pick.favoured).toBe("b");
    expect(fetchImpl).toHaveBeenCalledWith("/api/upcoming/b-1/pick", { method: "POST", cache: "no-store" });
  });

  it("fails with the status on a bad response", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "x" }, { status: 503 }));
    await expect(fetchPick("b-1", fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(PickRequestError);
  });
});

describe("UpcomingPick (before the click)", () => {
  it("offers a closed button with a warning and names nobody", () => {
    const html = renderToStaticMarkup(<UpcomingPick boutId="b1" nameA="Alan A" nameB="Ben B" />);
    expect(html).toContain("Show who&#x27;s favoured");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("stays closed until you open it");
    expect(html).not.toMatch(/Alan A|Ben B|%/);
  });
});

describe("the bout card", () => {
  const event = (hasPick: boolean): UpcomingEvent => ({
    id: "e1",
    slug: "test",
    name: "UFC 1: A vs. B",
    eventDate: "2026-10-24",
    location: null,
    mainCardAt: null,
    prelimsAt: null,
    earlyPrelimsAt: null,
    bouts: [
      {
        id: "b1",
        position: 1,
        segment: null,
        weightClass: "Lightweight",
        isTitleFight: false,
        a: { name: "Alan A", slug: null, country: null, record: null, styles: [] },
        b: { name: "Ben B", slug: null, country: null, record: null, styles: [] },
        prediction: null,
        hasPick,
      },
    ],
  });

  it("shows the button only for a bout that has a pick, and no side in the page", () => {
    const withPick = renderToStaticMarkup(<UpcomingView event={event(true)} today={new Date("2026-10-05")} />);
    expect(withPick).toContain("Show who&#x27;s favoured");
    expect(withPick).not.toMatch(/is favoured|Too close|slight lean|\d+%/);
    const without = renderToStaticMarkup(<UpcomingView event={event(false)} today={new Date("2026-10-05")} />);
    expect(without).not.toContain("favoured");
  });
});
