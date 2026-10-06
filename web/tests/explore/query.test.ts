import { describe, expect, it } from "vitest";
import { METRICS, SORTS, metricById, sortById } from "@/lib/explore/metrics";
import {
  DEFAULT_STATE,
  MAX_RULES,
  PRESETS,
  applyPreset,
  freshState,
  parseState,
  pillsOf,
  runFinder,
  stateToSearch,
  type FinderState,
} from "@/lib/explore/query";
import type { EventFacets, ExploreEvent } from "@/lib/explore/types";

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

function event(
  id: string,
  name: string,
  date: string,
  stars: number[],
  patch: Partial<EventFacets> | null = {},
  location = "Las Vegas, Nevada",
): ExploreEvent {
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

const EVENTS: ExploreEvent[] = [
  event("a", "UFC 300: Big Night", "2024-04-13", [5, 4.5, 4], { titleFights: 2, champions: 2, eloAvg: 1700, rankedBouts: 5, weightClasses: ["Lightweight", "Women's Strawweight"], womensFights: 1 }),
  event("b", "UFC Fight Night: Quiet", "2023-03-04", [3, 2.5, 3.5], { eloAvg: 1500, eloGapAvg: 20, evenFights: 5 }, "Abu Dhabi, UAE"),
  event("c", "UFC 250: Old One", "2020-06-06", [4, 4], { rematches: 1, countries: ["us"] }),
  event("d", "UFC Fight Night: No Facets", "2019-01-01", [4.5], null),
  event("e", "UFC Fight Night: Unrated", "2025-01-01", [], { eloAvg: null, eloGapAvg: null }),
];

const state = (patch: Partial<FinderState>): FinderState => freshState(patch);
const ids = (outcome: { matches: ExploreEvent[] }) => outcome.matches.map((e) => e.id);

describe("the registry", () => {
  it("gives every order a known metric, and no id twice", () => {
    for (const option of SORTS) {
      if (option.metric !== null) expect(metricById(option.metric), option.id).not.toBeNull();
    }
    expect(new Set(SORTS.map((s) => s.id)).size).toBe(SORTS.length);
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length);
  });

  it("knows the card's numbers from the ratings and the facets", () => {
    const a = EVENTS[0]!;
    expect(metricById("cardRating")!.value(a)).toBeCloseTo(4.5);
    expect(metricById("bestFight")!.value(a)).toBe(5);
    expect(metricById("greatFights")!.value(a)).toBe(2);
    expect(metricById("classics")!.value(a)).toBe(1);
    expect(metricById("titleFights")!.value(a)).toBe(2);
    expect(metricById("cardRating")!.value(EVENTS[4]!)).toBeNull(); // nothing rated
    expect(metricById("eloAvg")!.value(EVENTS[3]!)).toBeNull(); // no facets
  });
});

describe("runFinder", () => {
  it("orders by card rating by default, unrated cards last", () => {
    expect(ids(runFinder(EVENTS, DEFAULT_STATE))).toEqual(["a", "d", "c", "b", "e"]); // a and d tie: the newer first
  });

  it("orders by date either way", () => {
    expect(ids(runFinder(EVENTS, state({ sort: "newest" })))).toEqual(["e", "a", "b", "c", "d"]);
    expect(ids(runFinder(EVENTS, state({ sort: "oldest" })))).toEqual(["d", "c", "b", "a", "e"]);
  });

  it("puts a card without a value last, also when the order is ascending", () => {
    expect(ids(runFinder(EVENTS, state({ sort: "eloGapAvg" })))).toEqual(["b", "a", "c", "e", "d"]);
    expect(ids(runFinder(EVENTS, state({ sort: "eloAvg" })))).toEqual(["a", "c", "b", "e", "d"]);
  });

  it("shows the value it orders by, and none when it orders by date", () => {
    expect(runFinder(EVENTS, state({ sort: "eloAvg" })).shown).toBe("eloAvg");
    expect(runFinder(EVENTS, state({ sort: "newest" })).shown).toBeNull();
  });

  it("filters on year, kind of event, place and country", () => {
    expect(ids(runFinder(EVENTS, state({ sort: "newest", fromYear: 2023, toYear: 2024 })))).toEqual(["a", "b"]);
    expect(ids(runFinder(EVENTS, state({ sort: "newest", kind: "numbered" })))).toEqual(["a", "c"]);
    expect(ids(runFinder(EVENTS, state({ sort: "newest", kind: "nights" })))).toEqual(["e", "b", "d"]);
    expect(ids(runFinder(EVENTS, state({ place: " abu dhabi " })))).toEqual(["b"]);
    expect(ids(runFinder(EVENTS, state({ sort: "newest", country: "br" })))).toEqual(["e", "a", "b"]);
  });

  it("requires every chosen weight class and every chosen flag", () => {
    expect(ids(runFinder(EVENTS, state({ weightClasses: ["Lightweight", "Women's Strawweight"] })))).toEqual(["a"]);
    expect(ids(runFinder(EVENTS, state({ flags: ["title"] })))).toEqual(["a"]);
    expect(ids(runFinder(EVENTS, state({ flags: ["rematch", "title"] })))).toEqual([]);
    expect(ids(runFinder(EVENTS, state({ flags: ["classic"] })))).toEqual(["a"]);
  });

  it("applies conditions as at least / at most and drops a card with no value for it", () => {
    const min = runFinder(EVENTS, state({ rules: [{ metric: "eloAvg", op: "min", value: 1580 }] }));
    expect(ids(min)).toEqual(["a", "c"]);
    const max = runFinder(EVENTS, state({ sort: "newest", rules: [{ metric: "eloAvg", op: "max", value: 1580 }] }));
    expect(ids(max)).toEqual(["b", "c"]);
  });

  it("matches nothing while the number of a condition is not filled in", () => {
    expect(ids(runFinder(EVENTS, state({ rules: [{ metric: "eloAvg", op: "min", value: NaN }] })))).toEqual([]);
  });
});

describe("the address bar", () => {
  it("round-trips a state", () => {
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

  it("never shares arrays between states", () => {
    const a = freshState();
    a.flags.push("title");
    expect(freshState().flags).toEqual([]);
    expect(DEFAULT_STATE.flags).toEqual([]);
  });
});

describe("pills", () => {
  it("lists each chosen filter once, and each removes only itself", () => {
    const chosen = state({
      fromYear: 2020,
      toYear: 2024,
      kind: "nights",
      flags: ["title", "rematch"],
      weightClasses: ["Flyweight"],
      country: "br",
      place: "Rio",
      rules: [{ metric: "eloAvg", op: "min", value: 1600 }],
    });
    const pills = pillsOf(chosen, () => "Brazil");
    expect(pills.map((p) => p.label)).toEqual([
      "2020–2024",
      "Fight Nights",
      "A title fight",
      "A rematch",
      "Flyweight",
      "Fighter from Brazil",
      "In Rio",
      "Average Elo going in ≥ 1600",
    ]);
    const after = pills.find((p) => p.key === "has-title")!.remove(chosen);
    expect(after.flags).toEqual(["rematch"]);
    expect(after.place).toBe("Rio");
    expect(pills.find((p) => p.key === "years")!.remove(chosen)).toMatchObject({ fromYear: null, toYear: null });
    expect(pillsOf(DEFAULT_STATE, () => "")).toEqual([]);
  });

  it("describes a one-sided year range", () => {
    expect(pillsOf(state({ fromYear: 2020 }), () => "")[0]!.label).toBe("From 2020");
    expect(pillsOf(state({ toYear: 2020 }), () => "")[0]!.label).toBe("Until 2020");
  });
});

describe("quick starts", () => {
  it("name known orders and start from a clean state", () => {
    for (const preset of PRESETS) {
      const next = applyPreset(preset);
      expect(sortById(next.sort), preset.id).not.toBeNull();
      expect(next.country).toBeNull();
    }
  });
});
