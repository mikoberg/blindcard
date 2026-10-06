import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FighterProfileView } from "@/components/FighterProfileView";
import { profileStats } from "@/lib/leaderboard/profile";
import type { FighterFight, FighterProfile } from "@/lib/leaderboard/types";

const fight = (patch: Partial<FighterFight> = {}): FighterFight => ({
  eventSlug: "ev-1",
  eventName: "Event One",
  eventDate: "2025-02-01",
  opponent: "Cid Three",
  opponentSlug: null,
  stars: 4,
  fightId: "f-1",
  weightClass: "Lightweight",
  isTitleFight: false,
  ...patch,
});

const fights = [
  fight({ eventSlug: "ev-2", eventName: "Event Two", eventDate: "2026-03-01", opponent: "Bea Two", opponentSlug: "bea-two", stars: 4.5, fightId: "f-2", isTitleFight: true }),
  fight(),
];

const profile = (patch: Partial<FighterProfile> = {}): FighterProfile => ({
  name: "Ann One",
  country: "nl",
  slug: "ann-one",
  average: 4.25,
  styles: [],
  record: null,
  elo: null,
  stats: profileStats(fights)!,
  fights,
  ...patch,
});

describe("FighterProfileView", () => {
  it("shows the average, the figures and each fight with its rating", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).toContain("Ann One");
    expect(html).toContain('aria-label="Average rating 4.3 out of 5"');
    expect(html).toContain("Rated fights");
    expect(html).toContain("Best rated");
    expect(html).toContain('aria-label="Rated 4.5 out of 5"');
    expect(html).toContain("Mar 2026");
    expect(html).toContain("url(/flags/nl.svg)");
  });

  it("links the opponent when they have a page, and the event to the fight's place on its card", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).toContain('href="/fighters/bea-two"');
    expect(html).toContain('href="/events/ev-2#fight-f-2"');
    expect(html).not.toContain("cid-three"); // no page: plain text
    expect(html).toContain(">Cid Three<");
  });

  it("shows the record and the Elo as they stand today, set apart when the Elo is provisional", () => {
    const html = renderToStaticMarkup(
      <FighterProfileView
        profile={profile({ record: { w: 24, l: 5, d: 1, nc: 1 }, elo: { rating: 1712.4, fights: 12 } })}
      />,
    );
    expect(html).toContain('aria-label="Record: 24-5-1 (1 NC). Show the full fight history (spoilers)"');
    expect(html).toContain('aria-label="Elo 1712"');
    expect(html).toContain("Record and Elo are as they stand today");
    const provisional = renderToStaticMarkup(
      <FighterProfileView profile={profile({ elo: { rating: 1560, fights: 2 } })} />,
    );
    expect(provisional).toContain("provisional");
    expect(provisional).toContain("~1560");
  });

  it("leaves out the record, the Elo and the styles when they are not known, and invents none", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).not.toMatch(/Record:|aria-label="Elo|as they stand today/);
  });

  it("shows the styles, the weight classes and the title fights", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile({ styles: ["Kickboxing", "Wrestling"] })} />);
    expect(html).toContain(">Kickboxing<");
    expect(html).toContain("Fought at Lightweight.");
    expect(html).toContain("1 title fight.");
  });

  it("draws one bar per rated fight, oldest first, with the ratings spelled out", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html.match(/class="bar/g)).toHaveLength(2);
    expect(html).toContain("oldest to newest: 4.0, 4.5");
  });

  it("explains the leaderboard minimum for a fighter with few fights, and not for one on the list", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile()} />);
    expect(html).toContain("divided by the number of fights");
    expect(html).toContain("from 8 rated fights");
    const many = Array.from({ length: 8 }, (_, i) => fight({ eventSlug: `e${i}`, opponent: `Opp ${i}` }));
    const long = renderToStaticMarkup(<FighterProfileView profile={profile({ fights: many, stats: profileStats(many)! })} />);
    expect(long).not.toContain("from 8 rated fights");
  });

  it("escapes hostile names", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile({ name: "<img src=x onerror=alert(1)>" })} />);
    expect(html).not.toContain("<img src=x");
  });

  it("shows nothing of a result before the gate is opened, only the gate and its warning", () => {
    const html = renderToStaticMarkup(
      <FighterProfileView profile={profile({ record: { w: 24, l: 5, d: 0, nc: 0 }, elo: { rating: 1700, fights: 12 } })} />,
    );
    expect(html.match(/24-5/g)).toHaveLength(2); // the aria label and the visible figure, once
    expect(html).toContain("Show the full fight history (spoilers)");
    expect(html).toContain("Spoilers: shows every fight of the career");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(/KO\/TKO|Submission|Decision|Won \d|aria-label="(Won|Lost)|→/);
  });
});

describe("the record as the way in to the fight history", () => {
  it("is a button that opens the history, with the spoiler warning right next to it", () => {
    const html = renderToStaticMarkup(
      <FighterProfileView profile={profile({ record: { w: 22, l: 7, d: 0, nc: 0 } })} />,
    );
    expect(html).toMatch(/<button type="button" aria-label="Record: 22-7\. Show the full fight history \(spoilers\)"/);
    expect(html).toContain("Full history (spoilers)");
    expect(html).toContain('id="fights"'); // the section it scrolls to
    expect(html).toContain("Fight history");
    expect(html).not.toContain('href="#fights"');
  });

  it("has no button when no record is known", () => {
    const html = renderToStaticMarkup(<FighterProfileView profile={profile({ record: null })} />);
    expect(html).not.toContain("Full history");
  });
});

describe("profileStats", () => {
  it("adds up the rated fights", () => {
    const stats = profileStats([
      fight({ eventDate: "2024-01-01", stars: 5, weightClass: "Lightweight", isTitleFight: true }),
      fight({ eventDate: "2025-01-01", stars: 3.5, weightClass: "Welterweight" }),
      fight({ eventDate: "2026-01-01", stars: 4, weightClass: "Lightweight" }),
    ])!;
    expect(stats).toEqual({
      rated: 3,
      best: 5,
      fourPlus: 2,
      firstYear: "2024",
      lastYear: "2026",
      weightClasses: ["Lightweight", "Welterweight"],
      titleFights: 1,
    });
  });

  it("is null without fights", () => {
    expect(profileStats([])).toBeNull();
  });
});
