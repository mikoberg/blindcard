import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StartTimes } from "@/components/StartTimes";
import { formatStart, isKnownZone, startTimes } from "@/lib/upcoming/time";

const EVENT = {
  mainCardAt: "2026-10-24T18:00:00Z",
  prelimsAt: "2026-10-24T16:00:00Z",
  earlyPrelimsAt: "2026-10-24T14:00:00Z",
};

describe("startTimes", () => {
  it("lists the known times, main card first, and skips the rest", () => {
    expect(startTimes(EVENT).map((t) => t.label)).toEqual(["Main card", "Prelims", "Early prelims"]);
    expect(startTimes({ mainCardAt: "2026-10-24T18:00:00Z", prelimsAt: null, earlyPrelimsAt: null })).toHaveLength(1);
    expect(startTimes({ mainCardAt: null, prelimsAt: null, earlyPrelimsAt: null })).toEqual([]);
  });
});

describe("formatStart", () => {
  it("reads a moment in a zone, with the weekday and the zone's short name", () => {
    expect(formatStart("2026-10-24T18:00:00Z", "Europe/Amsterdam")).toEqual({
      weekday: "Sat",
      time: "20:00",
      zone: "CEST",
    });
    expect(formatStart("2026-10-24T18:00:00Z", "Asia/Dubai")).toMatchObject({ weekday: "Sat", time: "22:00" });
  });

  it("moves the weekday when the zone crosses midnight, and follows daylight saving", () => {
    expect(formatStart("2026-10-25T05:00:00Z", "Europe/Amsterdam")).toMatchObject({ weekday: "Sun", time: "06:00" }); // CET again
    expect(formatStart("2026-10-24T05:00:00Z", "America/Los_Angeles")).toMatchObject({ weekday: "Fri", time: "22:00" });
  });

  it("knows a good zone from a bad one", () => {
    expect(isKnownZone("Europe/Amsterdam")).toBe(true);
    expect(isKnownZone("Mars/Olympus")).toBe(false);
  });
});

describe("StartTimes", () => {
  it("renders in Amsterdam on the server, main card prominent on the tile", () => {
    const html = renderToStaticMarkup(<StartTimes times={startTimes(EVENT)} variant="tile" />);
    expect(html).toContain("Main card");
    expect(html).toContain("Sat 20:00");
    expect(html).toContain("CEST");
    expect(html).toContain("Prelims 18:00");
    expect(html).toContain("Early prelims 16:00");
  });

  it("lists every time on the page and says so when none is announced", () => {
    const page = renderToStaticMarkup(<StartTimes times={startTimes(EVENT)} variant="page" />);
    expect(page).toContain("20:00");
    expect(page).toContain("18:00");
    expect(page).toContain("16:00");
    expect(renderToStaticMarkup(<StartTimes times={[]} variant="page" />)).toContain("not announced yet");
    expect(renderToStaticMarkup(<StartTimes times={[]} variant="tile" />)).toBe("");
  });
});
