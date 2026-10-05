import { describe, expect, it } from "vitest";
import { splitScorecard } from "@/lib/judges/parse";
import { judgeSlug } from "@/lib/judges/slug";

describe("judgeSlug", () => {
  it("matches the ingest side: accents and apostrophes dropped, hyphens between words", () => {
    expect(judgeSlug("Sal D'amato")).toBe("sal-damato");
    expect(judgeSlug("José Álvarez")).toBe("jose-alvarez");
    expect(judgeSlug("  Patricia Morse-Jarman ")).toBe("patricia-morse-jarman");
    expect(judgeSlug("D’Amato Sal")).toBe("damato-sal");
  });
});

describe("splitScorecard", () => {
  it("splits the judge from the scores", () => {
    expect(splitScorecard("Ron McCarthy 29 - 28")).toEqual({
      judge: "Ron McCarthy",
      slug: "ron-mccarthy",
      scores: "29 - 28",
    });
    expect(splitScorecard("Chris Lee 28-29")?.scores).toBe("28 - 29");
  });

  it("removes a note stuck to the name", () => {
    expect(
      splitScorecard("Point Deducted: Low Blows by ZhangEric Colon 27 - 29")
        ?.judge,
    ).toBe("Eric Colon");
    expect(
      splitScorecard(
        "Technical Decision: Groin Strike to DanhoBen Cartlidge 19 - 18",
      )?.slug,
    ).toBe("ben-cartlidge");
  });

  it("returns null for text that is not a scorecard", () => {
    expect(splitScorecard("something else")).toBeNull();
    expect(splitScorecard("Point Deducted: nothing useful 29 - 28")).toBeNull();
  });
});
