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


describe("FightCard storylines", () => {
  const withCareer = makeFight(2, 4, {
    fighterA: { id: "a", name: "Ann One" },
    fighterB: { id: "b", name: "Bea Two" },
    career: { meetings: 1, a: { streak: 5, unbeaten: false }, b: { streak: 0, unbeaten: true } },
  });

  it("shows what was known before the fight", () => {
    const html = render(withCareer);
    expect(html).toContain('aria-label="Before the fight"');
    expect(html).toContain("Rematch");
    expect(html).toContain("Ann One has won 5 in a row");
    expect(html).toContain("Bea Two is unbeaten in the promotion");
  });

  it("shows no list at all when there is no storyline", () => {
    expect(render(makeFight(2, 4))).not.toContain("Before the fight");
  });
});
