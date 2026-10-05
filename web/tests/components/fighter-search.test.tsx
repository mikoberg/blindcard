import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FighterRow } from "@/components/FighterRow";
import { FighterSearch } from "@/components/FighterSearch";

describe("FighterSearch", () => {
  it("renders a labelled search box and the leaderboard it wraps while nothing is typed", () => {
    const html = renderToStaticMarkup(
      <FighterSearch>
        <p>THE LEADERBOARD</p>
      </FighterSearch>,
    );
    expect(html).toContain("Find a fighter");
    expect(html).toContain('type="search"');
    expect(html).toContain("THE LEADERBOARD");
  });
});

describe("FighterRow", () => {
  const props = { slug: "cub-swanson", name: "Cub Swanson", country: "us", fights: 20 };

  it("highlights an average that shows as 4.0, like every other 4.0", () => {
    const html = renderToStaticMarkup(<FighterRow {...props} average={3.96} />);
    expect(html).toContain("text-[var(--accent)]");
    expect(html).toContain('aria-label="Average rating 4.0 out of 5"');
  });

  it("does not highlight 3.9", () => {
    expect(renderToStaticMarkup(<FighterRow {...props} average={3.94} />)).not.toContain("text-[var(--accent)]");
  });

  it("says why a fighter is not ranked and links to their fights", () => {
    const html = renderToStaticMarkup(<FighterRow {...props} fights={3} average={4.2} note="not ranked yet (needs 8)" />);
    expect(html).toContain("3 rated fights, not ranked yet (needs 8)");
    expect(html).toContain('href="/fighters/cub-swanson"');
  });
});
