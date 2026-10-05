import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventHeader } from "@/components/EventHeader";
import { ShareFightButton } from "@/components/ShareFightButton";
import { SiteSearch } from "@/components/SiteSearch";
import { eventSearchWords, isEventSearchResult } from "@/lib/search/events";
import type { EventSummary } from "@/lib/overview/types";

describe("eventSearchWords", () => {
  it("splits into lower-case words and drops punctuation and pattern characters", () => {
    expect(eventSearchWords("Van vs. Pantoja")).toEqual(["van", "vs", "pantoja"]);
    expect(eventSearchWords("50%_off\\")).toEqual(["50", "off"]);
  });

  it("keeps numbers of any length, ignores one-letter words and caps the word count", () => {
    expect(eventSearchWords("UFC 3")).toEqual(["ufc", "3"]);
    expect(eventSearchWords("a b c")).toEqual([]);
    expect(eventSearchWords("one two three four five six")).toHaveLength(4);
  });

  it("returns nothing for text with no letters or digits", () => {
    expect(eventSearchWords("''  --")).toEqual([]);
  });
});

describe("isEventSearchResult", () => {
  it("accepts only same-site links", () => {
    expect(isEventSearchResult({ name: "A", date: "2026-01-01", href: "/events/a" })).toBe(true);
    expect(isEventSearchResult({ name: "A", date: "2026-01-01", href: "https://evil.example" })).toBe(false);
    expect(isEventSearchResult({ name: "A", date: "2026-01-01", href: "//evil.example" })).toBe(false);
  });
});

describe("SiteSearch", () => {
  it("renders an empty, labelled search box and no results", () => {
    const html = renderToStaticMarkup(<SiteSearch />);
    expect(html).toContain("Find a fighter or an event");
    expect(html).toContain('type="search"');
    expect(html).not.toContain("<li");
  });
});

describe("ShareFightButton", () => {
  it("names both fighters for assistive tech and shows no link or rating before a click", () => {
    const html = renderToStaticMarkup(<ShareFightButton fightId="f1" fighterA="Alan A" fighterB="Ben B" />);
    expect(html).toContain('aria-label="Share Alan A versus Ben B"');
    expect(html).not.toMatch(/http|#fight|stars/);
  });
});

describe("EventHeader", () => {
  const event: EventSummary = {
    id: "e1",
    slug: "test",
    name: "UFC 1: Alan vs. Ben",
    eventDate: "2026-09-26",
    location: "Las Vegas, Nevada, USA",
    mainEvent: { a: "Alan A", b: "Ben B", title: false },
    ratings: [
      { position: 1, stars: 4 },
      { position: 2, stars: 3 },
    ],
  };

  it("shows name, date, place and the card rating without the old form labels", () => {
    const html = renderToStaticMarkup(<EventHeader event={event} />);
    expect(html).toContain("UFC 1: Alan vs. Ben");
    expect(html).toContain("Sat 26 Sep 2026");
    expect(html).toContain("Las Vegas, Nevada, USA");
    expect(html).toContain('aria-label="Card rating 3.5 out of 5"');
    expect(html).not.toContain("field-label");
  });

  it("leaves out the rating plate and the place when there are none", () => {
    const html = renderToStaticMarkup(<EventHeader event={{ ...event, ratings: [], location: null }} />);
    expect(html).not.toContain("Card rating");
    expect(html).not.toContain("Las Vegas");
  });
});
