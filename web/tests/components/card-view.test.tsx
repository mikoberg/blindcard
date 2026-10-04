import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardView } from "@/components/CardView";
import type { CardEvent } from "@/lib/card/types";
import { makeFight } from "../card/helpers";

const event: CardEvent = {
  id: "e1",
  name: "UFC Fight Night: Alpha vs. Beta",
  slug: "ufc-fight-night-alpha-vs-beta",
  eventDate: "2026-09-26",
  location: "Las Vegas, Nevada, USA",
};
const render = (fights = [makeFight(1, 4.5), makeFight(2, 3)]) =>
  renderToStaticMarkup(<CardView event={event} fights={fights} />);

describe("CardView", () => {
  it("shows the event header and the full card", () => {
    const html = render();
    expect(html).toContain("UFC Fight Night: Alpha vs. Beta");
    expect(html).toContain("Sat 26 Sep 2026");
    expect(html).toContain("Las Vegas, Nevada, USA");
    expect(html).toContain("Watch these");
    expect(html).toContain('data-fight-id="fight-1"');
    expect(html).toContain('data-fight-id="fight-2"');
  });

  it("says so when the event has no fights yet instead of rendering nothing", () => {
    const html = render([]);
    expect(html).toContain("The card for this event isn&#x27;t available yet.");
    expect(html).not.toContain("Watch these");
  });

  it("shows a banner and 'Not rated yet' when nothing is scored", () => {
    const html = render([makeFight(1, null), makeFight(2, null)]);
    expect(html).toContain("Ratings are on their way.");
    expect(html).toContain("Not rated yet");
    expect(html).not.toContain("Watch these");
  });

  it("says when nothing stands out", () => {
    const html = render([makeFight(1, 3), makeFight(2, 3.5)]);
    expect(html).toContain("No standout fights on this card");
  });

  it("keeps fighter A before fighter B inside the 'Watch these' list", () => {
    const html = render([
      makeFight(1, 4.5, {
        fighterA: { id: "a", name: "Zed Zulu" },
        fighterB: { id: "b", name: "Abe Alpha" },
      }),
    ]);
    const watch = html.slice(html.indexOf("Watch these"), html.indexOf("Full card"));
    expect(watch.indexOf("Zed Zulu")).toBeGreaterThan(-1);
    expect(watch.indexOf("Zed Zulu")).toBeLessThan(watch.indexOf("Abe Alpha"));
  });

  it("does not use the site's branding with a promotion name", () => {
    const html = render();
    // The event name is a plain fact from the database (also as the poster's series line);
    // nothing else may contain the promotion's name.
    const withoutEventName = html
      .replaceAll("UFC Fight Night: Alpha vs. Beta", "")
      .replaceAll("UFC Fight Night", "");
    expect(withoutEventName).not.toMatch(/UFC|Octagon/);
  });
});

describe("CardView with card segments", () => {
  const segmented = [
    makeFight(1, 4.5, { cardSegment: "main" }),
    makeFight(2, 3, { cardSegment: "main" }),
    makeFight(3, 4, { cardSegment: "prelim" }),
    makeFight(4, 2, { cardSegment: "early_prelim" }),
  ];

  it("shows the fights under Main card, Prelims and Early prelims, in that order", () => {
    const html = render(segmented);
    const main = html.indexOf("Main card");
    const prelims = html.indexOf("Prelims");
    const early = html.indexOf("Early prelims");
    expect(main).toBeGreaterThan(-1);
    expect(prelims).toBeGreaterThan(main);
    expect(early).toBeGreaterThan(prelims);
    // each fight sits after its own heading
    expect(html.indexOf('data-fight-id="fight-2"')).toBeLessThan(prelims);
    expect(html.indexOf('data-fight-id="fight-3"')).toBeGreaterThan(prelims);
    expect(html.indexOf('data-fight-id="fight-4"')).toBeGreaterThan(early);
  });

  it("shows a flat card when the event has no segments", () => {
    const html = render([makeFight(1, 4.5), makeFight(2, 3)]);
    expect(html).not.toContain("Main card");
    expect(html).not.toContain("Prelims");
  });

  it("shows a flat card when only some fights have a segment (never half a split)", () => {
    const html = render([makeFight(1, 4.5, { cardSegment: "main" }), makeFight(2, 3)]);
    expect(html).not.toContain("Early prelims");
    expect(html).not.toContain("Prelims");
  });
});
