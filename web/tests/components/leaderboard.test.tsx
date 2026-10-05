import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FighterLeaderboard } from "@/components/FighterLeaderboard";

describe("FighterLeaderboard", () => {
  const entries = [
    { rank: 1, id: "a", slug: "ann-one", name: "Ann One", country: "nl", fights: 12, average: 4.25 },
    { rank: 2, id: "b", slug: "Bad Slug!", name: "<img src=x onerror=alert(1)>", country: null, fights: 7, average: 3.9 },
  ];

  it("shows rank, name, number of fights and the average rating", () => {
    const html = renderToStaticMarkup(<FighterLeaderboard entries={entries} />);
    expect(html).toContain("Ann One");
    expect(html).toContain("12 rated fights");
    expect(html).toContain('aria-label="Average rating 4.3 out of 5"');
    expect(html).toContain("/flags/nl.svg");
  });

  it("escapes hostile names", () => {
    const html = renderToStaticMarkup(<FighterLeaderboard entries={entries} />);
    expect(html).not.toContain("<img src=x");
  });

  it("links a fighter to the fights behind their average, and never links a bad slug", () => {
    const html = renderToStaticMarkup(<FighterLeaderboard entries={entries} />);
    expect(html).toContain('href="/fighters/ann-one"');
    expect(html).not.toContain("Bad Slug");
  });
});
