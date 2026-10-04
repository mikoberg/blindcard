import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FightCard } from "@/components/FightCard";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import type { ScoreView } from "@/lib/reveal/format";
import { makeFight } from "../card/helpers";

const factor = (label: string, amount: string, share: number) => ({
  label,
  value: "9.0 strikes per min",
  amount,
  share,
});

const score: ScoreView = {
  fight: {
    up: [factor("Striking pace", "+0.55", 1)],
    down: [factor("Time under control without a finish", "−0.30", 0.5)],
  },
  performance: { stars: 4.5, up: [factor("Ended by KO/TKO", "+1.00", 1)], down: [] },
};

describe("ScoreBreakdown", () => {
  it("lists what helped and what held the rating back, with signed amounts", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown score={score} />);
    expect(html).toContain("Why this rating");
    expect(html).toContain("What helped");
    expect(html).toContain("What held it back");
    expect(html).toContain("Striking pace");
    expect(html).toContain("+0.55");
    expect(html).toContain("−0.30");
  });

  it("shows the performance axis with its own stars and says why it is hidden until now", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown score={score} />);
    expect(html).toContain("Performance");
    expect(html).toContain('aria-label="Rated 4.5 out of 5"');
    expect(html).toContain("only shown after a reveal");
  });

  it("omits the performance block when the version has none", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown score={{ ...score, performance: null }} />);
    expect(html).not.toContain("Performance");
  });

  it("says so instead of rendering an empty section", () => {
    const empty: ScoreView = { fight: { up: [], down: [] }, performance: null };
    expect(renderToStaticMarkup(<ScoreBreakdown score={empty} />)).toContain("No single factor stood out");
  });

  it("escapes labels", () => {
    const html = renderToStaticMarkup(
      <ScoreBreakdown
        score={{ fight: { up: [factor("<img src=x onerror=alert(1)>", "+1.00", 1)], down: [] }, performance: null }}
      />,
    );
    expect(html).not.toContain("<img src=x");
  });
});

describe("the public card", () => {
  it("never carries the breakdown before a reveal", () => {
    const html = renderToStaticMarkup(<FightCard fight={makeFight(1, 4.5)} />);
    expect(html).not.toContain("Why this rating");
    expect(html).not.toContain("Performance");
    expect(html).not.toContain("What helped");
  });
});
