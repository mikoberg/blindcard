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

  it("flags the result vocabulary the app itself produces", () => {
    for (const leaky of [
      "Raul Rosas Jr. wins",
      "X wins by Submission",
      "Submission",
      "Draw",
      "No contest",
      "DQ",
      '{"endRound":2,"endTimeSeconds":98,"method":"Submission"}',
      '{"end_time_seconds":98}',
      '{"outcome":"draw"}',
      "Doctor's Stoppage",
      "Doctor&#x27;s Stoppage",
      "Doctor&#39;s Stoppage",
    ]) {
      expect(findLeaks(leaky, HTML_LEAK_PATTERNS), leaky).not.toEqual([]);
    }
  });

  it("flags bonuses and the method key in rendered output", () => {
    for (const leaky of [
      "Fight of the Night",
      "Performance of the Night",
      "performance of the night",
      "FOTN",
      "POTN",
      '{"bonuses":["Fight of the Night"]}',
      '{"bonuses":[]}',
      '{"method":"x"}', // only the key itself, so the pattern is what flags it
    ]) {
      expect(findLeaks(leaky, HTML_LEAK_PATTERNS), leaky).not.toEqual([]);
    }
  });

  it("keeps the vocabulary patterns out of the client bundle list (format.ts legitimately holds those words)", () => {
    for (const word of ["wins", "Submission", "No contest", "DQ", '"outcome":"win"', "endRound", '"bonuses"', "Fight of the Night"]) {
      expect(findLeaks(word, CHUNK_LEAK_PATTERNS), word).toEqual([]);
    }
  });

  it("passes ordinary page text", () => {
    const clean =
      "Main event. Lightweight title fight, scheduled for five rounds. Rated 4.5 out of 5. Sat 26 Sep 2026. Reveal result";
    expect(findLeaks(clean, HTML_LEAK_PATTERNS)).toEqual([]);
    expect(findLeaks(clean, CHUNK_LEAK_PATTERNS)).toEqual([]);
  });
});

describe("the fighter page exemption", () => {
  it("lets a fighter's page name the bonuses and nothing else", async () => {
    const { FIGHTER_PAGE_HTML_LEAK_PATTERNS } = await import("./leaks");
    expect(findLeaks("12 FOTN 5 POTN Fight of the Night bonuses", FIGHTER_PAGE_HTML_LEAK_PATTERNS)).toEqual([]);
    expect(findLeaks("Raul Rosas Jr. KO/TKO", FIGHTER_PAGE_HTML_LEAK_PATTERNS)).not.toEqual([]);
    expect(findLeaks("a Submission", FIGHTER_PAGE_HTML_LEAK_PATTERNS)).not.toEqual([]);
    expect(findLeaks("12 FOTN", HTML_LEAK_PATTERNS)).not.toEqual([]); // every other page still may not
  });
});
