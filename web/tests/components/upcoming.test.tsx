import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpcomingCard } from "@/components/UpcomingCard";
import { UpcomingSection } from "@/components/UpcomingSection";
import { UpcomingView } from "@/components/UpcomingView";
import type { UpcomingBout, UpcomingEvent } from "@/lib/upcoming/types";
import { countdownLabel, daysUntil } from "@/lib/upcoming/when";

const TODAY = new Date("2026-10-05T12:00:00Z");

const bout = (patch: Partial<UpcomingBout> = {}): UpcomingBout => ({
  id: "b1",
  position: 1,
  segment: "main",
  weightClass: "Featherweight",
  isTitleFight: true,
  a: { name: "Alexander Volkanovski", slug: "alexander-volkanovski", country: "au" },
  b: { name: "Movsar Evloev", slug: null, country: null },
  ...patch,
});

const event = (patch: Partial<UpcomingEvent> = {}): UpcomingEvent => ({
  id: "e1",
  slug: "ufc-333-volkanovski-vs-evloev",
  name: "UFC 333: Volkanovski vs. Evloev",
  eventDate: "2026-10-24",
  location: "Etihad Arena, Abu Dhabi, United Arab Emirates",
  bouts: [
    bout(),
    bout({ id: "b2", position: 2, segment: "prelim", isTitleFight: false, weightClass: "Lightweight" }),
  ],
  ...patch,
});

describe("countdown", () => {
  it("counts whole days from today and says it in words", () => {
    expect(daysUntil("2026-10-05", TODAY)).toBe(0);
    expect(daysUntil("2026-10-24", TODAY)).toBe(19);
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(5)).toBe("in 5 days");
    expect(countdownLabel(19)).toBe("in 3 weeks");
    expect(countdownLabel(90)).toBe("in 3 months");
  });
});

describe("UpcomingCard", () => {
  it("links to the upcoming page and shows headliners, place, countdown and the bout count", () => {
    const html = renderToStaticMarkup(<UpcomingCard event={event()} today={TODAY} />);
    expect(html).toContain('href="/upcoming/ufc-333-volkanovski-vs-evloev"');
    expect(html).toContain("Volkanovski");
    expect(html).toContain("Evloev");
    expect(html).toContain("Etihad Arena");
    expect(html).toContain("in 3 weeks");
    expect(html).toContain("2 bouts announced");
    expect(html).toContain("Title fight");
  });

  it("says so when the card is not announced yet", () => {
    const html = renderToStaticMarkup(<UpcomingCard event={event({ bouts: [] })} today={TODAY} />);
    expect(html).toContain("Card not announced yet");
  });
});

describe("UpcomingSection", () => {
  it("renders nothing without events and lists later events under the first four", () => {
    expect(renderToStaticMarkup(<UpcomingSection events={[]} today={TODAY} />)).toBe("");
    const many = Array.from({ length: 6 }, (_, i) =>
      event({ id: `e${i}`, slug: `event-${i}`, name: `UFC ${i}: A vs. B` }),
    );
    const html = renderToStaticMarkup(<UpcomingSection events={many} today={TODAY} />);
    expect(html.match(/bouts announced/g)).toHaveLength(4);
    expect(html).toContain('href="/upcoming/event-5"');
  });
});

describe("UpcomingView", () => {
  it("shows names and weight class, links only matched fighters, and no record or rating", () => {
    const html = renderToStaticMarkup(<UpcomingView event={event()} today={TODAY} />);
    expect(html).toContain("Alexander Volkanovski");
    expect(html).toContain('href="/fighters/alexander-volkanovski"');
    expect(html).toContain("Movsar Evloev");
    expect(html).not.toContain('href="/fighters/null"');
    expect(html).toContain("Featherweight");
    expect(html).toContain("Main card");
    expect(html).toContain("Prelims");
    expect(html).toContain("Bouts can still change");
    // pre-fight facts only: nothing like a record, a streak or a rating
    expect(html).not.toMatch(/\d+-\d+-\d+|unbeaten|Won \d|rated|Reveal/i);
  });

  it("shows a flat list when a bout has no segment, and a notice when no card is announced", () => {
    const flat = renderToStaticMarkup(
      <UpcomingView
        event={event({ bouts: [bout({ segment: null }), bout({ id: "b2", position: 2, segment: "prelim" })] })}
        today={TODAY}
      />,
    );
    expect(flat).not.toContain("Prelims");
    const empty = renderToStaticMarkup(<UpcomingView event={event({ bouts: [] })} today={TODAY} />);
    expect(empty).toContain("has not been announced yet");
  });

  it("escapes hostile names", () => {
    const html = renderToStaticMarkup(
      <UpcomingView
        event={event({ bouts: [bout({ a: { name: "<img src=x onerror=alert(1)>", slug: null, country: null } })] })}
        today={TODAY}
      />,
    );
    expect(html).not.toContain("<img src=x");
  });
});
