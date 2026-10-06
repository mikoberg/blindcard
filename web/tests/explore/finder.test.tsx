import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardFinder } from "@/components/CardFinder";
import { HTML_LEAK_PATTERNS, findLeaks } from "../spoiler/leaks";

describe("CardFinder, as first rendered", () => {
  const html = renderToStaticMarkup(<CardFinder />);

  it("is one bar: the order and a Filters button, with the panel closed", () => {
    expect(html).toContain("Order by");
    expect(html).toContain("Best card rating");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Filters/);
    expect(html).not.toContain("Has a fighter from"); // the fields wait in the closed panel
  });

  it("offers a few quick starts while nothing is chosen", () => {
    for (const label of ["Title nights", "Evenly matched on Elo", "Stacked with ranked fighters"]) {
      expect(html).toContain(label);
    }
  });

  it("has no locked options, no warnings and nothing about results", () => {
    expect(html).not.toMatch(/Spoilers|spoiler|locked|Unlock/i);
    expect(findLeaks(html, HTML_LEAK_PATTERNS)).toEqual([]);
  });
});
