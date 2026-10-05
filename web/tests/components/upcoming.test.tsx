import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpcomingCard } from "@/components/UpcomingCard";
import { UpcomingSection } from "@/components/UpcomingSection";
import { UpcomingView } from "@/components/UpcomingView";
import { mapPrediction } from "@/lib/data/upcoming";
import { lookOutFor } from "@/lib/upcoming/prediction";
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
  prediction: null,
  hasPick: false,
  ...patch,
});

const event = (patch: Partial<UpcomingEvent> = {}): UpcomingEvent => ({
  id: "e1",
  slug: "ufc-333-volkanovski-vs-evloev",
  name: "UFC 333: Volkanovski vs. Evloev",
  eventDate: "2026-10-24",
  location: "Etihad Arena, Abu Dhabi, United Arab Emirates",
  mainCardAt: null,
  prelimsAt: null,
  earlyPrelimsAt: null,
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

describe("expected ratings", () => {
  const predicted = (stars: number, patch: Partial<UpcomingBout> = {}): UpcomingBout =>
    bout({
      prediction: {
        stars,
        basis: "both",
        why: [
          { label: "Spot on the card", amount: 0.74 },
          { label: "Earlier fights of both fighters", amount: -0.2 },
        ],
      },
      ...patch,
    });

  it("draws the expectation dashed, with a tilde and the word expected, never as a gold plate", () => {
    const html = renderToStaticMarkup(
      <UpcomingView event={event({ bouts: [predicted(4.34)] })} today={TODAY} />,
    );
    expect(html).toContain('aria-label="Expected rating 4.3 out of 5"');
    expect(html).toContain("border-dashed");
    expect(html).toContain("expected");
    expect(html).not.toMatch(/gold|classic/i);
  });

  it("explains how it got there in stars, and says how much history it rests on", () => {
    const html = renderToStaticMarkup(
      <UpcomingView event={event({ bouts: [predicted(3.3)] })} today={TODAY} />,
    );
    expect(html).toContain("How we got this");
    expect(html).toContain("+0.7 stars");
    expect(html).toContain("−0.2 stars");
    expect(html).toContain("earlier rated fights of both fighters");
    expect(html).toContain("About the expected ratings");
  });

  it("points out the most promising bouts on the tile, best first, and only strong ones", () => {
    const bouts = [
      predicted(3.4, { id: "weak", position: 1 }),
      predicted(4.1, { id: "best", position: 2, a: { name: "Petr Yan", slug: null, country: null }, b: { name: "Merab Dvalishvili", slug: null, country: null } }),
      predicted(3.8, { id: "good", position: 3 }),
      predicted(3.6, { id: "third", position: 4 }),
    ];
    expect(lookOutFor(bouts).map((b) => b.id)).toEqual(["best", "good"]);
    expect(lookOutFor([predicted(3.4)])).toEqual([]);
    expect(lookOutFor([bout()])).toEqual([]);
    const html = renderToStaticMarkup(<UpcomingCard event={event({ bouts })} today={TODAY} />);
    expect(html).toContain("Look out for");
    expect(html).toContain("(~4.1)");
    expect(html).not.toContain("(~3.4)");
  });

  it("shows no card-level number: it hardly differs between cards", () => {
    const html = renderToStaticMarkup(
      <UpcomingView event={event({ bouts: [predicted(4), predicted(3, { id: "b2", position: 2 })] })} today={TODAY} />,
    );
    expect(html).not.toContain("Expected card rating");
    const tile = renderToStaticMarkup(
      <UpcomingCard event={event({ bouts: [predicted(3.0)] })} today={TODAY} />,
    );
    expect(tile).not.toContain("expected</p>");
  });

  it("uses no result words anywhere on the page", () => {
    const html = renderToStaticMarkup(
      <UpcomingView event={event({ bouts: [predicted(3.8)] })} today={TODAY} />,
    );
    expect(html).not.toMatch(/winner|\bwins\b|\bDraw\b|KO\/TKO|Decision - /i);
  });
});

describe("mapPrediction", () => {
  const complete = { predicted_stars: "3.45", prediction_basis: "one", prediction_why: [{ label: "x", amount: 0.2 }, { nope: 1 }] };

  it("reads a complete expectation and drops malformed reasons", () => {
    expect(mapPrediction(complete)).toEqual({ stars: 3.45, basis: "one", why: [{ label: "x", amount: 0.2 }] });
  });

  it("is null when anything is missing or out of range", () => {
    expect(mapPrediction({ ...complete, predicted_stars: null })).toBeNull();
    expect(mapPrediction({ ...complete, predicted_stars: 5.5 })).toBeNull();
    expect(mapPrediction({ ...complete, prediction_basis: "guess" })).toBeNull();
    expect(mapPrediction({ ...complete, prediction_why: "oops" })?.why).toEqual([]);
  });
});
