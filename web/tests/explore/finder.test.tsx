import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardFinder } from "@/components/CardFinder";
import { HTML_LEAK_PATTERNS, findLeaks } from "../spoiler/leaks";

describe("CardFinder, as first rendered (before any click)", () => {
  const html = renderToStaticMarkup(<CardFinder />);

  it("offers the spoiler-free orders and shows the others locked", () => {
    expect(html).toContain("Best card rating");
    expect(html).toContain("Highest average Elo");
    expect(html).toMatch(/<optgroup label="Spoilers \(locked\)">/);
    expect(html).toMatch(/<option value="knockouts" disabled="">/);
  });

  it("puts the warning right above the button that unlocks them", () => {
    const warning = html.indexOf("Spoilers ahead");
    const button = html.indexOf(">Unlock the spoiler filters<");
    expect(warning).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(warning);
    expect(html.indexOf("<button", warning)).toBeLessThanOrEqual(button);
  });

  it("disables the spoiler quick starts until they are unlocked", () => {
    expect(html).toMatch(/<button type="button" disabled="" title="Unlock the spoiler filters first"[^>]*>Knockout nights/);
    expect(html).toMatch(/<button type="button" class="[^"]*">Best rated cards/);
  });

  it("carries no result and no result data in the markup", () => {
    expect(findLeaks(html, HTML_LEAK_PATTERNS)).toEqual([]);
  });
});
