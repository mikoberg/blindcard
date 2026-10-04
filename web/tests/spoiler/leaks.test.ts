import { describe, expect, it } from "vitest";
import { CHUNK_LEAK_PATTERNS, HTML_LEAK_PATTERNS, findLeaks } from "./leaks";

describe("findLeaks (negative control: the scanner can fail)", () => {
  it("flags each kind of result data", () => {
    for (const leaky of [
      "Raul Rosas Jr. KO/TKO",
      "Decision - Unanimous",
      "Mike Bell 28 - 29",
      "Round 5, 1:38",
      "select * from fight_results",
      '{"winnerFighterId":"x"}',
      "http://ufcstats.com/fight-details/abc",
    ]) {
      expect(findLeaks(leaky, HTML_LEAK_PATTERNS), leaky).not.toEqual([]);
    }
    expect(findLeaks("a TKO - Doctor's Stoppage", CHUNK_LEAK_PATTERNS)).not.toEqual([]);
  });

  it("passes ordinary page text", () => {
    const clean =
      "Main event. Lightweight title fight, scheduled for five rounds. Rated 4.5 out of 5. Sat 26 Sep 2026. Reveal result";
    expect(findLeaks(clean, HTML_LEAK_PATTERNS)).toEqual([]);
    expect(findLeaks(clean, CHUNK_LEAK_PATTERNS)).toEqual([]);
  });
});
