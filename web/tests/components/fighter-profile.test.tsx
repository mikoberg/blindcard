import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FighterProfileView } from "@/components/FighterProfileView";
import type { FighterProfile } from "@/lib/leaderboard/types";

const profile = (patch: Partial<FighterProfile> = {}): FighterProfile => ({
  name: "Ann One",
  country: "nl",
  slug: "ann-one",
  average: 4.25,
  fights: [
    { eventSlug: "ev-2", eventName: "Event Two", eventDate: "2026-03-01", opponent: "Bea Two", stars: 4.5 },
    { eventSlug: "ev-1", eventName: "Event One", eventDate: "2025-02-01", opponent: "Cid Three", stars: 4 },
  ],
  ...patch,
});

describe("FighterProfileView", () => {
  it("shows the average, how many fights it is made of and each fight with its rating", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).toContain("Ann One");
    expect(html).toContain("Average of 2 rated fights");
    expect(html).toContain('aria-label="Average rating 4.3 out of 5"');
    expect(html).toContain("vs Bea Two");
    expect(html).toContain('href="/events/ev-2"');
    expect(html).toContain('aria-label="Rated 4.5 out of 5"');
    expect(html).toContain("Sun 1 Mar 2026");
  });

  it("explains the average and the leaderboard minimum for a fighter with few fights", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).toContain("divided by the number of fights");
    expect(html).toContain("from 8 rated fights");
  });

  it("does not mention the minimum for a fighter who is on the leaderboard", () => {
    const fights = Array.from({ length: 8 }, (_, i) => ({
      eventSlug: `e${i}`,
      eventName: `Event ${i}`,
      eventDate: "2025-01-01",
      opponent: `Opp ${i}`,
      stars: 4,
    }));
    expect(renderToStaticMarkup(<FighterProfileView profile={profile({ fights })} />)).not.toContain("from 8 rated fights");
  });

  it("escapes hostile names", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile({ name: "<img src=x onerror=alert(1)>" })} />);
    expect(html).not.toContain("<img src=x");
  });
});
