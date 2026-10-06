import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FightCard } from "@/components/FightCard";
import { makeFight } from "../card/helpers";

const render = (fight = makeFight(3, 4.5)) => renderToStaticMarkup(<FightCard fight={fight} />);

describe("FightCard", () => {
  it("shows the stars, the blurb and a reveal button", () => {
    const html = render(makeFight(1, 4.5, { isTitleFight: true, scheduledRounds: 5 }));
    expect(html).toContain('aria-label="Rated 4.5 out of 5"');
    expect(html).toContain("Main event. Lightweight title fight, scheduled for five rounds.");
    expect(html).toContain("Reveal result");
    expect(html).toContain('data-fight-id="fight-1"');
    expect(html).toContain("Title fight");
  });

  it("shows exactly 'Not rated yet' for an unrated fight", () => {
    const html = render(makeFight(4, null));
    expect(html).toContain("Not rated yet");
    expect(html).not.toContain("Rated ");
  });

  it("shows the Hidden gem badge only for high-rated early-card fights", () => {
    expect(render(makeFight(7, 4.5))).toContain("Hidden gem");
    expect(render(makeFight(2, 4.5))).not.toContain("Hidden gem");
    expect(render(makeFight(7, 3))).not.toContain("Hidden gem");
  });

  it("escapes hostile fighter names and lets long names wrap", () => {
    const html = render(
      makeFight(3, 3, {
        fighterA: { id: "a", name: "<img src=x onerror=alert(1)>" },
        fighterB: { id: "b", name: `O'Malley "The ${"Very ".repeat(14)}Long" Ünal` },
      }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("break-words");
  });

  it("renders fighter A before fighter B, never reordered", () => {
    const html = render(
      makeFight(3, 3, {
        fighterA: { id: "a", name: "Zed Zulu" },
        fighterB: { id: "b", name: "Abe Alpha" },
      }),
    );
    expect(html.indexOf("Zed Zulu")).toBeGreaterThan(-1);
    expect(html.indexOf("Zed Zulu")).toBeLessThan(html.indexOf("Abe Alpha"));
  });

  it("never renders a result word", () => {
    const html = render(makeFight(3, 5));
    expect(html).not.toMatch(/KO\/TKO|Submission|Decision|winner|wins/i);
  });
});

describe("FightCard fighters, records and storylines", () => {
  const fight = makeFight(2, 4, {
    fighterA: { id: "a", name: "Ann One", country: "br" },
    fighterB: { id: "b", name: "Bea Two", country: "se" },
    records: { a: { w: 23, l: 3, d: 0, nc: 0 }, b: { w: 14, l: 2, d: 0, nc: 1 } },
    career: { meetings: 1, a: { streak: 5, unbeaten: false }, b: { streak: 0, unbeaten: true } },
  });

  it("puts each fighter on a line of their own: flag, name, note and the record going in", () => {
    const html = render(fight);
    const a = html.indexOf(">Ann One<");
    const b = html.indexOf(">Bea Two<");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    // each record sits with its own fighter (between their name and the next fighter)
    expect(html.slice(a, b)).toContain("23-3");
    expect(html.slice(a, b)).not.toContain("14-2");
    expect(html.slice(b)).toContain("14-2");
    expect(html).toContain("(1 NC)");
    expect(html).toContain("url(/flags/br.svg)");
    expect(html).toContain("url(/flags/se.svg)");
  });

  it("describes the record for assistive tech", () => {
    expect(render(fight)).toContain('aria-label="Record before the fight: 23-3"');
    expect(render(fight)).toContain('aria-label="Record before the fight: 14-2 (1 NC)"');
  });

  it("notes an unbeaten fighter or a win streak under their name, and the rematch as a badge", () => {
    const html = render(fight);
    expect(html).toContain("Won 5 in a row");
    expect(html).toContain("Unbeaten in the promotion");
    expect(html).toContain("Rematch");
    expect(html.indexOf("Won 5 in a row")).toBeLessThan(html.indexOf(">Bea Two<"));
    expect(html.indexOf("Unbeaten in the promotion")).toBeGreaterThan(html.indexOf(">Bea Two<"));
  });

  it("shows a fighter without a known record as just their name", () => {
    const html = render(makeFight(2, 4, { records: { a: null, b: { w: 1, l: 0, d: 0, nc: 0 } } }));
    expect(html.match(/Record before the fight/g)).toHaveLength(1);
  });

  it("shows nothing extra for a fight without records or storylines", () => {
    const html = render(makeFight(2, 4));
    expect(html).not.toContain("Record before the fight");
    expect(html).not.toContain("Rematch");
  });
});


describe("FightCard: no guessed records", () => {
  const own = { w: 6, l: 4, d: 0, nc: 0 };

  it("shows no record at all when only the record in the promotion is known", () => {
    const html = render(
      makeFight(2, 4, {
        fighterA: { id: "a", name: "Ann One" },
        career: { meetings: 0, a: { streak: 0, unbeaten: false, record: own }, b: { streak: 0, unbeaten: false } },
      }),
    );
    expect(html).not.toContain("6-4");
    expect(html).not.toContain("in the promotion");
    expect(html).not.toContain("Record before the fight");
  });

  it("notes a promotion debut instead of a 0-0 record", () => {
    const html = render(
      makeFight(2, 4, {
        career: {
          meetings: 0,
          a: { streak: 0, unbeaten: false, record: { w: 0, l: 0, d: 0, nc: 0 } },
          b: { streak: 0, unbeaten: false },
        },
      }),
    );
    expect(html).toContain("Promotion debut");
    expect(html).not.toContain("0-0");
  });
});

describe("FightCard: five stars are the classics", () => {
  it("marks a five-star fight with the classic badge and a gold-foil plate", () => {
    const html = render(makeFight(2, 5));
    expect(html).toContain("Classic");
    expect(html).toContain("<svg");
    expect(html).toContain("linear-gradient(145deg");
  });

  it("does not mark 4.5 stars", () => {
    const html = render(makeFight(2, 4.5));
    expect(html).not.toContain("Classic");
    expect(html).not.toContain("linear-gradient(145deg");
  });
});

describe("FightCard: the official video", () => {
  it("links to the official video when we have one, opening a new tab safely", () => {
    const html = renderToStaticMarkup(<FightCard fight={makeFight(2, 5, { videoId: "dQw4w9WgXcQ" })} />);
    expect(html).toContain("Watch the fight");
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("can reveal the result");
  });

  it("offers nothing without a video (no search link as a stand-in), and ignores a bad id", () => {
    expect(renderToStaticMarkup(<FightCard fight={makeFight(2, 5)} />)).not.toContain("Watch the fight");
    expect(renderToStaticMarkup(<FightCard fight={makeFight(2, 5, { videoId: "x" })} />)).not.toContain("youtube.com");
  });
});

describe("FightCard fighting styles", () => {
  it("shows each fighter's styles under their own name, and nothing when they are not known", () => {
    const html = render(
      makeFight(2, 4, {
        fighterA: { id: "a", name: "Ann One", country: "br", styles: ["Kickboxing", "Brazilian jiu-jitsu"] },
        fighterB: { id: "b", name: "Bea Two", country: "se" },
      }),
    );
    const a = html.indexOf(">Ann One<");
    const b = html.indexOf(">Bea Two<");
    expect(html.slice(a, b)).toContain("Kickboxing, Brazilian jiu-jitsu");
    expect(html.slice(b)).not.toMatch(/Kickboxing|jiu-jitsu|Wrestling/);
  });
});

describe("FightCard fighter links", () => {
  const fight = makeFight(2, 4, {
    fighterA: { id: "a", name: "Ann One", country: "br", slug: "ann-one" },
    fighterB: { id: "b", name: "Bea Two", country: "se", slug: null },
  });

  it("links a name to the profile page when the fighter has one", () => {
    const html = render(fight);
    expect(html).toContain('<a class="');
    expect(html).toContain('href="/fighters/ann-one"');
    expect(html).toMatch(/href="\/fighters\/ann-one"[^>]*>Ann One<\/a>/);
  });

  it("leaves a name without a page as plain text, never a link that would not open", () => {
    const html = render(fight);
    expect(html).not.toContain("bea-two");
    expect(html).not.toMatch(/<a [^>]*>Bea Two<\/a>/);
    expect(html).toContain(">Bea Two<");
  });

  it("links nothing on a card that was built without page slugs", () => {
    const html = render(makeFight(2, 4));
    expect(html).not.toContain('href="/fighters/');
  });
});
