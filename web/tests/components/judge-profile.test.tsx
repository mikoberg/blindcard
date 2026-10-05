import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JudgeProfileView } from "@/components/JudgeProfileView";
import { ScorecardLine } from "@/components/ScorecardLine";
import type { BaselineRow, JudgeRow } from "@/lib/judges/types";

const baseline: BaselineRow = {
  cards: 10000,
  dissent: 700,
  abs_sum: 20600,
  abs_sumsq: 46000,
  judges_with_enough: 50,
};
const row = (patch: Partial<JudgeRow> = {}): JudgeRow => ({
  slug: "ann-one",
  name: "Ann One",
  slugs: ["ann-one"],
  cards: 400,
  dissent: 28,
  lone_dissent: 12,
  abs_sum: 824,
  abs_sumsq: 1840,
  first_year: 2012,
  last_year: 2026,
  ...patch,
});
const others = [
  row(),
  row({ slug: "bea-two", name: "Bea Two", dissent: 40 }),
  row({ slug: "cid-three", name: "Cid Three", dissent: 20 }),
];

describe("JudgeProfileView", () => {
  it("shows the totals, the comparison and the plain verdict for a typical judge", () => {
    const html = renderToStaticMarkup(
      <JudgeProfileView
        judge={row()}
        baseline={baseline}
        comparable={others}
      />,
    );
    expect(html).toContain("Ann One");
    expect(html).toContain("400 scorecards");
    expect(html).toContain("7.0%");
    expect(html).toContain("In line with the other judges.");
    expect(html).toContain('role="img"');
    expect(html).toContain('href="/judges/bea-two"');
  });

  it("states a clear difference in words", () => {
    const html = renderToStaticMarkup(
      <JudgeProfileView
        judge={row({ cards: 120, dissent: 17 })}
        baseline={baseline}
        comparable={others}
      />,
    );
    expect(html).toContain(
      "Scores against the official result more often than other judges.",
    );
  });

  it("says nothing numeric about a judge with too few scorecards", () => {
    const html = renderToStaticMarkup(
      <JudgeProfileView
        judge={row({ cards: 0, dissent: 0, abs_sum: 0, abs_sumsq: 0 })}
        baseline={baseline}
        comparable={others}
      />,
    );
    expect(html).toContain("Not enough scorecards yet");
    expect(html).not.toContain("%");
  });

  it("names no fight and uses none of the result words the spoiler scan looks for", () => {
    const html = renderToStaticMarkup(
      <JudgeProfileView
        judge={row()}
        baseline={baseline}
        comparable={others}
      />,
    );
    expect(html).not.toMatch(
      /winner|\bwins\b|\bDraw\b|\b\d{2} - \d{2}\b|KO\/TKO/i,
    );
  });

  it("escapes hostile names", () => {
    const html = renderToStaticMarkup(
      <JudgeProfileView
        judge={row({ name: "<img src=x onerror=alert(1)>" })}
        baseline={baseline}
        comparable={others}
      />,
    );
    expect(html).not.toContain("<img src=x");
  });
});

describe("ScorecardLine", () => {
  it("links the judge and keeps the scores", () => {
    const html = renderToStaticMarkup(
      <ScorecardLine text="Ron McCarthy 29 - 28" />,
    );
    expect(html).toContain('href="/judges/ron-mccarthy"');
    expect(html).toContain("Ron McCarthy");
    expect(html).toContain("29 - 28");
  });

  it("shows text that is not a scorecard as it is", () => {
    expect(renderToStaticMarkup(<ScorecardLine text="odd text" />)).toBe(
      "odd text",
    );
  });
});
