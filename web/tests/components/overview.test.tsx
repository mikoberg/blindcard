import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/components/EventCard";
import { EventHeader } from "@/components/EventHeader";
import { EventPoster } from "@/components/EventPoster";
import { Monogram } from "@/components/Monogram";
import { YearNav } from "@/components/YearNav";
import type { EventSummary } from "@/lib/overview/types";

const event = (patch: Partial<EventSummary> = {}): EventSummary => ({
  id: "e1",
  slug: "fight-night-alpha-vs-beta",
  name: "Fight Night: Alpha vs. Beta",
  eventDate: "2026-09-12",
  location: "Las Vegas, Nevada",
  mainEvent: { a: "Raoni Barcelos", b: "Raul Rosas Jr.", title: false },
  ratings: [
    { position: 1, stars: 4.5 },
    { position: 2, stars: 3 },
    { position: 4, stars: 2 },
    { position: 6, stars: 4 },
  ],
  ...patch,
});

describe("EventPoster", () => {
  it("draws one bar per rated fight, taller for higher ratings, amber from 4 stars", () => {
    const html = renderToStaticMarkup(<EventPoster event={event()} size="md" />);
    const heights = [...html.matchAll(/height:(\d+)%/g)].map((m) => Number(m[1]));
    expect(heights).toEqual([89, 57, 36, 79]);
    expect(html.match(/class="bar bar-hi"/g)).toHaveLength(2);
    expect(html.match(/class="bar"/g)).toHaveLength(2);
  });

  it("describes the strip with counts and the best rating only", () => {
    const html = renderToStaticMarkup(<EventPoster event={event()} size="md" />);
    expect(html).toContain('aria-label="4 fights rated, best 4.5 out of 5"');
  });

  it("shows a flat baseline and says ratings are coming when nothing is rated", () => {
    const html = renderToStaticMarkup(<EventPoster event={event({ ratings: [] })} size="sm" />);
    expect(html).toContain('aria-label="Ratings are on their way"');
    expect(html).not.toContain("height:");
  });

  it("animates the bars only when asked to", () => {
    expect(renderToStaticMarkup(<EventPoster event={event()} size="md" />)).not.toContain("bar-rise");
    expect(renderToStaticMarkup(<EventPoster event={event()} size="md" animate />)).toContain("bar-rise");
  });

  it("gives the same event the same colours every time", () => {
    const first = renderToStaticMarkup(<EventPoster event={event()} size="md" />);
    expect(renderToStaticMarkup(<EventPoster event={event()} size="md" />)).toBe(first);
  });
});

describe("EventPoster type", () => {
  it("sets the main event's family names large, in the same order as everywhere else", () => {
    const html = renderToStaticMarkup(<EventPoster event={event()} size="md" />);
    expect(html).toContain("Barcelos");
    expect(html).toContain("Rosas");
    expect(html.indexOf("Barcelos")).toBeLessThan(html.indexOf("Rosas"));
    expect(html).not.toContain("Jr.");
    expect(html).toContain("poster-type");
  });

  it("puts the event's own title on the poster: the series line over the family names", () => {
    const html = renderToStaticMarkup(
      <EventPoster
        event={event({ name: "UFC 332: Silva vs. Wang", mainEvent: { a: "Natalia Silva", b: "Wang Cong", title: true } })}
        size="md"
      />,
    );
    expect(html).toContain("poster-label");
    expect(html).toContain(">UFC 332<");
    expect(html.indexOf(">UFC 332<")).toBeLessThan(html.indexOf(">Silva<"));
    expect(html).toContain(">Wang<");
    expect(html).not.toContain(">Cong<");
  });

  it("marks a title fight on the poster and not otherwise", () => {
    const title = renderToStaticMarkup(
      <EventPoster event={event({ mainEvent: { a: "A One", b: "B Two", title: true } })} size="md" />,
    );
    expect(title).toContain("Title fight");
    expect(renderToStaticMarkup(<EventPoster event={event()} size="md" />)).not.toContain("Title fight");
  });

  it("falls back to the event's name when the main event is not known", () => {
    const html = renderToStaticMarkup(<EventPoster event={event({ mainEvent: null })} size="sm" />);
    expect(html).toContain("Fight Night: Alpha vs. Beta");
  });

  it("hides the type from assistive tech (the card says it in words)", () => {
    const html = renderToStaticMarkup(<EventPoster event={event()} size="md" />);
    expect(html).toMatch(/class="poster-type"[^>]*aria-hidden="true"/);
  });

  it("puts header and footer around the type on the event page", () => {
    const html = renderToStaticMarkup(
      <EventPoster event={event()} size="lg" header={<p>HEADER</p>} footer={<p>FOOTER</p>} />,
    );
    expect(html.indexOf("HEADER")).toBeLessThan(html.indexOf("Barcelos"));
    expect(html.indexOf("Barcelos")).toBeLessThan(html.indexOf("FOOTER"));
  });
});

describe("EventCard", () => {
  it("links to the event and shows name, date, location and the best fight", () => {
    const html = renderToStaticMarkup(<EventCard event={event()} />);
    expect(html).toContain('href="/events/fight-night-alpha-vs-beta"');
    expect(html).toContain("Fight Night: Alpha vs. Beta");
    expect(html).toContain("Sat 12 Sep 2026");
    expect(html).toContain("Las Vegas, Nevada");
    expect(html).toContain('aria-label="Best fight rated 4.5 out of 5"');
  });

  it("counts hidden gems (4+ stars from card position 6) and says nothing when there are none", () => {
    expect(renderToStaticMarkup(<EventCard event={event()} />)).toContain("1 hidden gem");
    expect(renderToStaticMarkup(<EventCard event={event({ ratings: [{ position: 6, stars: 4 }, { position: 7, stars: 5 }] })} />)).toContain("2 hidden gems");
    expect(renderToStaticMarkup(<EventCard event={event({ ratings: [{ position: 1, stars: 2 }] })} />)).not.toContain("hidden gem");
  });

  it("says the main event in words for screen readers", () => {
    const html = renderToStaticMarkup(<EventCard event={event()} />);
    expect(html).toContain("Main event: Raoni Barcelos versus Raul Rosas Jr.");
  });

  it("shows no best-fight rating for an event without ratings", () => {
    const html = renderToStaticMarkup(<EventCard event={event({ ratings: [] })} />);
    expect(html).not.toContain("Best fight");
    expect(html).not.toContain("best fight");
  });

  it("escapes hostile names and lets long ones wrap", () => {
    const html = renderToStaticMarkup(<EventCard event={event({ name: "<img src=x onerror=alert(1)>" })} />);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("break-words");
  });
});

describe("EventHeader", () => {
  it("puts the name, date and location on the poster, above the strip", () => {
    const html = renderToStaticMarkup(<EventHeader event={event()} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Fight Night: Alpha vs. Beta");
    expect(html).toContain("Sat 12 Sep 2026");
    expect(html).toContain("Las Vegas, Nevada");
    expect(html).toContain("4 fights rated");
  });

  it("omits the location line when there is none", () => {
    expect(renderToStaticMarkup(<EventHeader event={event({ location: null })} />)).not.toContain("Las Vegas");
  });
});

describe("YearNav", () => {
  it("links every year to its section", () => {
    const html = renderToStaticMarkup(<YearNav years={["2026", "2025"]} />);
    expect(html).toContain('href="#year-2026"');
    expect(html).toContain('href="#year-2025"');
    expect(html).toContain('aria-label="Years"');
  });
});

describe("Monogram with a flag", () => {
  it("puts the country's flag behind the initials", () => {
    const html = renderToStaticMarkup(<Monogram name="Arman Tsarukyan" country="am" />);
    expect(html).toContain("url(/flags/am.svg)");
    expect(html).toContain(">AT<");
  });

  it("keeps the name-based colour when the country is unknown, or not a clean code", () => {
    for (const country of [null, undefined, "", "../etc", "Brazil"]) {
      const html = renderToStaticMarkup(<Monogram name="Arman Tsarukyan" country={country} />);
      expect(html).not.toContain("/flags/");
    }
  });
});

describe("Monogram", () => {
  it("shows initials, is decorative, and takes its colour from the name", () => {
    const a = renderToStaticMarkup(<Monogram name="Arman Tsarukyan" />);
    expect(a).toContain(">AT<");
    expect(a).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<Monogram name="Arman Tsarukyan" />)).toBe(a);
  });
});
