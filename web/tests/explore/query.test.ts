import { describe, expect, it } from "vitest";
import { METRICS, SORTS, metricById, sortById, sortIsSpoiler } from "@/lib/explore/metrics";
import {
  DEFAULT_STATE,
  MAX_RULES,
  PRESETS,
  applyPreset,
  isFiltered,
  parseState,
  runFinder,
  stateToSearch,
  usesResults,
  withoutSpoilers,
  type FinderState,
} from "@/lib/explore/query";
import type { EventFacets, ExploreEvent, ResultFacets, ResultsByEvent } from "@/lib/explore/types";

const facets = (patch: Partial<EventFacets> = {}): EventFacets => ({
  titleFights: 0,
  fiveRoundFights: 1,
  womensFights: 0,
  rematches: 0,
  longestStreak: 3,
  evenFights: 2,
  eloGapAvg: 60,
  eloAvg: 1580,
  eloPeak: 1700,
  rankedFighters: 4,
  champions: 0,
  top5Fighters: 1,
  rankedBouts: 1,
  weightClasses: ["Lightweight", "Welterweight"],
  countries: ["us", "br"],
  ...patch,
});

function event(id: string, name: string, date: string, stars: number[], patch: Partial<EventFacets> | null = {}, location = "Las Vegas, Nevada"): ExploreEvent {
  return {
    id,
    slug: id,
    name,
    eventDate: date,
    location,
    mainEvent: null,
    ratings: stars.map((s, i) => ({ position: i + 1, stars: s })),
    facets: patch === null ? null : facets(patch),
  };
}

const results = (patch: Partial<ResultFacets> = {}): ResultFacets => ({
  fights: 12,
  knockouts: 4,
  submissions: 2,
  decisions: 6,
  splitDecisions: 1,
  roundOneFinishes: 2,
  totalSeconds: 7200,
  longestSeconds: 1500,
  fastestFinishSeconds: 30,
  bonuses: 3,
  upsets: 1,
  knockdowns: 5,
  strikes: 1800,
  takedowns: 20,
  subAttempts: 9,
  controlSeconds: 2000,
  ...patch,
});

const EVENTS: ExploreEvent[] = [
  event("a", "UFC 300: Big Night", "2024-04-13", [5, 4.5, 4], { titleFights: 2, champions: 2, eloAvg: 1700, rankedBouts: 5, weightClasses: ["Lightweight", "Women's Strawweight"], womensFights: 1 }),
  event("b", "UFC Fight Night: Quiet", "2023-03-04", [3, 2.5, 3.5], { eloAvg: 1500, eloGapAvg: 20, evenFights: 5 }, "Abu Dhabi, UAE"),
  event("c", "UFC 250: Old One", "2020-06-06", [4, 4], { rematches: 1, countries: ["us"] }),
  event("d", "UFC Fight Night: No Facets", "2019-01-01", [4.5], null),
  event("e", "UFC Fight Night: Unrated", "2025-01-01", [], { eloAvg: null, eloGapAvg: null }),
];

const BY_EVENT: ResultsByEvent = {
  a: results({ knockouts: 7, submissions: 1, totalSeconds: 9000 }),
  b: results({ knockouts: 1, submissions: 5, totalSeconds: 5000, fastestFinishSeconds: null }),
  c: results({ knockouts: 3, totalSeconds: 3000 }),
};

const state = (patch: Partial<FinderState>): FinderState => ({ ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [], ...patch });
const ids = (outcome: { matches: ExploreEvent[] }) => outcome.matches.map((e) => e.id);

describe("the registry", () => {
  it("gives every sort a known metric, and spoiler sorts only on result metrics", () => {
    for (const option of SORTS) {
      if (option.metric !== null) expect(metricById(option.metric), option.id).not.toBeNull();
      expect(sortIsSpoiler(option)).toBe(option.metric !== null && metricById(option.metric)!.spoiler);
    }
    expect(new Set(SORTS.map((s) => s.id)).size).toBe(SORTS.length);
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length);
  });

  it("knows the card's public numbers from the ratings and the facets", () => {
    const a = EVENTS[0]!;
    expect(metricById("cardRating")!.value(a, undefined)).toBeCloseTo(4.5);
    expect(metricById("bestFight")!.value(a, undefined)).toBe(5);
    expect(metricById("greatFights")!.value(a, undefined)).toBe(2);
    expect(metricById("classics")!.value(a, undefined)).toBe(1);
    expect(metricById("titleFights")!.value(a, undefined)).toBe(2);
    expect(metricById("cardRating")!.value(EVENTS[4]!, undefined)).toBeNull(); // nothing rated
    expect(metricById("eloAvg")!.value(EVENTS[3]!, undefined)).toBeNull(); // no facets
  });

  it("computes the result numbers only when the results are there", () => {
    const a = EVENTS[0]!;
    expect(metricById("knockouts")!.value(a, undefined)).toBeNull();
    const r = BY_EVENT.a!;
    expect(metricById("finishes")!.value(a, r)).toBe(8);
    expect(metricById("finishRate")!.value(a, r)).toBeCloseTo((8 / 12) * 100);
    expect(metricById("cardMinutes")!.value(a, r)).toBe(150);
    expect(metricById("strikePace")!.value(a, r)).toBeCloseTo(1800 / 150);
  });
});

describe("runFinder: public filters", () => {
  it("orders by card rating by default, unrated cards last", () => {
    expect(ids(runFinder(EVENTS, null, DEFAULT_STATE))).toEqual(["a", "d", "c", "b", "e"]); // a and d tie at 4.5: the newer first
  });

  it("orders by date either way and breaks ties by the newer event", () => {
    expect(ids(runFinder(EVENTS, null, state({ sort: "newest" })))).toEqual(["e", "a", "b", "c", "d"]);
    expect(ids(runFinder(EVENTS, null, state({ sort: "oldest" })))).toEqual(["d", "c", "b", "a", "e"]);
  });

  it("puts a card without a value last, also when the order is ascending", () => {
    expect(ids(runFinder(EVENTS, null, state({ sort: "eloGapAvg" })))).toEqual(["b", "a", "c", "e", "d"]);
    expect(ids(runFinder(EVENTS, null, state({ sort: "eloAvg" })))).toEqual(["a", "c", "b", "e", "d"]);
  });

  it("filters on year, kind of event, place and country", () => {
    expect(ids(runFinder(EVENTS, null, state({ sort: "newest", fromYear: 2023, toYear: 2024 })))).toEqual(["a", "b"]);
    expect(ids(runFinder(EVENTS, null, state({ sort: "newest", kind: "numbered" })))).toEqual(["a", "c"]);
    expect(ids(runFinder(EVENTS, null, state({ sort: "newest", kind: "nights" })))).toEqual(["e", "b", "d"]);
    expect(ids(runFinder(EVENTS, null, state({ place: " abu dhabi " })))).toEqual(["b"]);
    expect(ids(runFinder(EVENTS, null, state({ sort: "newest", country: "br" })))).toEqual(["e", "a", "b"]);
  });

  it("requires every chosen weight class and every chosen flag", () => {
    expect(ids(runFinder(EVENTS, null, state({ weightClasses: ["Lightweight", "Women's Strawweight"] })))).toEqual(["a"]);
    expect(ids(runFinder(EVENTS, null, state({ flags: ["title"] })))).toEqual(["a"]);
    expect(ids(runFinder(EVENTS, null, state({ flags: ["rematch", "title"] })))).toEqual([]);
    expect(ids(runFinder(EVENTS, null, state({ flags: ["classic"] })))).toEqual(["a"]);
  });

  it("applies conditions as at least / at most and drops a card with no value for it", () => {
    const min = runFinder(EVENTS, null, state({ rules: [{ metric: "eloAvg", op: "min", value: 1580 }] }));
    expect(ids(min)).toEqual(["a", "c"]);
    const max = runFinder(EVENTS, null, state({ sort: "newest", rules: [{ metric: "eloAvg", op: "max", value: 1580 }] }));
    expect(ids(max)).toEqual(["b", "c"]);
  });
});

describe("runFinder: the spoiler filters", () => {
  const knockouts = state({ sort: "knockouts" });

  it("ignores result orders and conditions until the results are unlocked", () => {
    const locked = runFinder(EVENTS, null, knockouts);
    expect(locked.needsResults).toBe(true);
    expect(locked.shown).toBeNull(); // falls back to the date
    expect(ids(locked)).toEqual(["e", "a", "b", "c", "d"]);
    const rule = runFinder(EVENTS, null, state({ sort: "newest", rules: [{ metric: "knockouts", op: "min", value: 5 }] }));
    expect(ids(rule)).toEqual(["e", "a", "b", "c", "d"]); // not applied, never guessed
  });

  it("orders and filters by the results once they are given", () => {
    const out = runFinder(EVENTS, BY_EVENT, knockouts);
    expect(out.needsResults).toBe(false);
    expect(out.shown).toBe("knockouts");
    expect(ids(out).slice(0, 3)).toEqual(["a", "c", "b"]);
    expect(ids(runFinder(EVENTS, BY_EVENT, state({ sort: "shortestCard" }))).slice(0, 3)).toEqual(["c", "b", "a"]);
    expect(ids(runFinder(EVENTS, BY_EVENT, state({ sort: "submissions" }))).slice(0, 1)).toEqual(["b"]);
    const only = runFinder(EVENTS, BY_EVENT, state({ rules: [{ metric: "knockouts", op: "min", value: 3 }] }));
    expect(ids(only).sort()).toEqual(["a", "c"]);
  });

  it("leaves out a card whose results are not known when a condition needs them", () => {
    const out = runFinder(EVENTS, BY_EVENT, state({ rules: [{ metric: "decisions", op: "min", value: 0 }] }));
    expect(ids(out).sort()).toEqual(["a", "b", "c"]); // d and e have no result facets
  });

  it("puts the fastest finish first and a card without a finish last", () => {
    const out = runFinder(EVENTS, { ...BY_EVENT, c: results({ fastestFinishSeconds: 12 }) }, state({ sort: "fastestFinish" }));
    expect(ids(out).slice(0, 2)).toEqual(["c", "a"]);
    expect(ids(out).slice(2)).toEqual(["e", "b", "d"]); // no finish or no results: last, newest first
  });
});

describe("the address bar", () => {
  it("round-trips a public state", () => {
    const original = state({
      sort: "eloAvg",
      fromYear: 2018,
      toYear: 2024,
      kind: "numbered",
      weightClasses: ["Flyweight"],
      flags: ["title", "women"],
      country: "gb-eng",
      place: "London",
      rules: [{ metric: "rankedFighters", op: "min", value: 6 }],
    });
    expect(parseState(stateToSearch(original))).toEqual(original);
    expect(stateToSearch(DEFAULT_STATE)).toBe("");
  });

  it("never writes or reads a result-based order or condition", () => {
    const spoiler = state({ sort: "knockouts", rules: [{ metric: "submissions", op: "min", value: 3 }, { metric: "eloAvg", op: "min", value: 1500 }] });
    const search = stateToSearch(spoiler);
    expect(search).not.toMatch(/knockouts|submissions/);
    expect(search).toContain("eloAvg");
    const read = parseState("sort=knockouts&if=submissions:min:3;eloAvg:max:1700");
    expect(read.sort).toBe(DEFAULT_STATE.sort);
    expect(read.rules).toEqual([{ metric: "eloAvg", op: "max", value: 1700 }]);
  });

  it("ignores anything it does not know", () => {
    const read = parseState("sort=nope&from=abc&to=3000&kind=x&class=Nope,Flyweight&has=nope,title&country=USA&if=eloAvg:between:1;eloAvg:min:&place=" + "x".repeat(200));
    expect(read.sort).toBe(DEFAULT_STATE.sort);
    expect(read.fromYear).toBeNull();
    expect(read.toYear).toBeNull();
    expect(read.kind).toBe("all");
    expect(read.weightClasses).toEqual(["Flyweight"]);
    expect(read.flags).toEqual(["title"]);
    expect(read.country).toBeNull();
    expect(read.rules).toEqual([]);
    expect(read.place).toHaveLength(60);
  });

  it("reads at most the maximum number of conditions", () => {
    const many = Array.from({ length: MAX_RULES + 3 }, () => "eloAvg:min:1500").join(";");
    expect(parseState(`if=${many}`).rules).toHaveLength(MAX_RULES);
  });
});

describe("state helpers", () => {
  it("knows when result data is needed and strips it again", () => {
    const spoiler = state({ sort: "knockouts", rules: [{ metric: "upsets", op: "min", value: 1 }, { metric: "eloAvg", op: "min", value: 1500 }] });
    expect(usesResults(spoiler)).toBe(true);
    expect(usesResults(DEFAULT_STATE)).toBe(false);
    const clean = withoutSpoilers(spoiler);
    expect(clean.sort).toBe(DEFAULT_STATE.sort);
    expect(clean.rules).toEqual([{ metric: "eloAvg", op: "min", value: 1500 }]);
    expect(usesResults(clean)).toBe(false);
  });

  it("tells whether anything besides the order is chosen", () => {
    expect(isFiltered(DEFAULT_STATE)).toBe(false);
    expect(isFiltered(state({ sort: "eloAvg" }))).toBe(false);
    expect(isFiltered(state({ flags: ["title"] }))).toBe(true);
  });

  it("has quick starts that name known orders, spoiler ones only on result metrics", () => {
    for (const preset of PRESETS) {
      const next = applyPreset(preset);
      const sort = sortById(next.sort);
      expect(sort, preset.id).not.toBeNull();
      expect(usesResults(next), preset.id).toBe(preset.spoiler);
    }
  });
});
