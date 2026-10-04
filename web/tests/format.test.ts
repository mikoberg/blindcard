import { describe, expect, it } from "vitest";
import { formatEventDate, groupEventsByYear } from "@/lib/format";
import type { CardEvent } from "@/lib/card/types";

describe("formatEventDate", () => {
  it("formats a date without timezone drift", () => {
    expect(formatEventDate("2026-09-26")).toBe("Sat 26 Sep 2026");
    expect(formatEventDate("2026-01-01")).toBe("Thu 1 Jan 2026");
    expect(formatEventDate("2026-12-31")).toBe("Thu 31 Dec 2026");
  });

  it("does not depend on the process timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["Pacific/Honolulu", "Europe/Amsterdam", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(formatEventDate("2026-09-26")).toBe("Sat 26 Sep 2026");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("rejects malformed or impossible dates", () => {
    for (const bad of ["", "garbage", "2026-13-40", "26-09-2026", "2026-9-26", "2026-02-30", "2026-04-31", "2026-02-29", "2026-00-10", "2026-01-00"]) {
      expect(() => formatEventDate(bad)).toThrow(RangeError);
    }
  });

  it("accepts a real leap day", () => {
    expect(formatEventDate("2028-02-29")).toBe("Tue 29 Feb 2028");
  });
});

const event = (id: string, eventDate: string): CardEvent => ({
  id,
  name: `Event ${id}`,
  slug: `event-${id}`,
  eventDate,
  location: null,
});

describe("groupEventsByYear", () => {
  it("groups in the given order (newest first stays newest first)", () => {
    const groups = groupEventsByYear([
      event("a", "2026-09-26"),
      event("b", "2026-05-30"),
      event("c", "2025-12-06"),
    ]);
    expect(groups.map((g) => g.year)).toEqual(["2026", "2025"]);
    expect(groups[0]?.events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list for no events", () => {
    expect(groupEventsByYear([])).toEqual([]);
  });
});
