import {
  FLAGS,
  WEIGHT_CLASSES,
  isFlagId,
  isMetricId,
  metricById,
  sortById,
  sortIsSpoiler,
  type FlagId,
  type MetricId,
} from "./metrics";
import type { ExploreEvent, ResultFacets, ResultsByEvent } from "./types";

/** A condition on one metric: at least / at most a number. */
export interface Rule {
  metric: MetricId;
  op: "min" | "max";
  value: number;
}

/** Everything the visitor has chosen. The default shows the best cards of all time. */
export interface FinderState {
  sort: string;
  fromYear: number | null;
  toYear: number | null;
  /** "numbered": UFC 300 and the like; "nights": Fight Nights. */
  kind: "all" | "numbered" | "nights";
  weightClasses: string[];
  flags: FlagId[];
  /** Lower-case country code of a fighter on the card. */
  country: string | null;
  /** Text the location must contain. */
  place: string;
  rules: Rule[];
}

export const DEFAULT_STATE: FinderState = {
  sort: "cardRating",
  fromYear: null,
  toYear: null,
  kind: "all",
  weightClasses: [],
  flags: [],
  country: null,
  place: "",
  rules: [],
};

export const MAX_RULES = 6;

const isNumbered = (event: ExploreEvent): boolean => /^UFC\s+\d+/i.test(event.name);

function yearOf(event: ExploreEvent): number {
  return Number(event.eventDate.slice(0, 4));
}

export interface FinderOutcome {
  matches: ExploreEvent[];
  /** The metric the list is ordered by, to show its value under each card (null: the date). */
  shown: MetricId | null;
  /** true when the state asks for result data that has not been unlocked: those parts are ignored. */
  needsResults: boolean;
}

/** Does this state use any metric that is computed from results? */
export function usesResults(state: FinderState): boolean {
  const sort = sortById(state.sort);
  return (sort !== null && sortIsSpoiler(sort)) || state.rules.some((rule) => metricById(rule.metric)?.spoiler);
}

function matchesPublic(event: ExploreEvent, state: FinderState): boolean {
  const year = yearOf(event);
  if (state.fromYear !== null && year < state.fromYear) return false;
  if (state.toYear !== null && year > state.toYear) return false;
  if (state.kind === "numbered" && !isNumbered(event)) return false;
  if (state.kind === "nights" && isNumbered(event)) return false;
  const place = state.place.trim().toLowerCase();
  if (place !== "" && !(event.location ?? "").toLowerCase().includes(place)) return false;
  if (state.weightClasses.length > 0) {
    const have = event.facets?.weightClasses ?? [];
    if (!state.weightClasses.every((wc) => have.includes(wc))) return false;
  }
  if (state.country !== null && !(event.facets?.countries ?? []).includes(state.country)) return false;
  for (const id of state.flags) {
    const flag = FLAGS.find((f) => f.id === id);
    const metric = flag ? metricById(flag.metric) : null;
    const value = metric ? metric.value(event, undefined) : null;
    if (value === null || value < 1) return false;
  }
  return true;
}

function passes(rule: Rule, value: number | null): boolean {
  if (value === null) return false;
  return rule.op === "min" ? value >= rule.value : value <= rule.value;
}

/**
 * Filters and orders the events. Conditions and orders that need result data are ignored until
 * `results` is given (the visitor has unlocked them); `needsResults` says so.
 */
export function runFinder(
  events: readonly ExploreEvent[],
  results: ResultsByEvent | null,
  state: FinderState,
): FinderOutcome {
  const unlocked = results !== null;
  const needsResults = !unlocked && usesResults(state);
  const rules = state.rules.filter((rule) => {
    const metric = metricById(rule.metric);
    return metric !== null && (unlocked || !metric.spoiler);
  });
  const ruleMetrics = rules.map((rule) => metricById(rule.metric));
  const filtered = events.filter((event) => {
    if (!matchesPublic(event, state)) return false;
    const own: ResultFacets | undefined = results?.[event.id];
    return rules.every((rule, index) => passes(rule, ruleMetrics[index]?.value(event, own) ?? null));
  });

  const requested = sortById(state.sort) ?? sortById("cardRating");
  const usable = requested !== null && (unlocked || !sortIsSpoiler(requested)) ? requested : sortById("newest");
  if (usable === null) return { matches: filtered, shown: null, needsResults };
  const metric = usable.metric === null ? null : metricById(usable.metric);
  const direction = usable.order === "desc" ? -1 : 1;
  const keyed = filtered.map((event) => ({
    event,
    key: metric ? metric.value(event, results?.[event.id]) : null,
  }));
  keyed.sort((a, b) => {
    if (metric === null) {
      return direction * a.event.eventDate.localeCompare(b.event.eventDate) || a.event.id.localeCompare(b.event.id);
    }
    // Events without a value go last, whichever way the list runs.
    if (a.key === null && b.key !== null) return 1;
    if (a.key !== null && b.key === null) return -1;
    const byValue = a.key === null || b.key === null ? 0 : direction * (a.key - b.key);
    return byValue || b.event.eventDate.localeCompare(a.event.eventDate) || a.event.id.localeCompare(b.event.id);
  });
  return { matches: keyed.map((row) => row.event), shown: metric ? metric.id : null, needsResults };
}

// ---------------------------------------------------------------------------------------------
// The address bar. Only what is not a spoiler goes into it: a link never carries a result-based
// order or condition, so opening one never asks for result data.

const FIRST_YEAR = 1993;

function year(value: string | null): number | null {
  if (value === null || !/^\d{4}$/.test(value)) return null;
  const n = Number(value);
  return n >= FIRST_YEAR && n <= 2100 ? n : null;
}

/** Reads a finder state from a query string. Anything unknown is ignored, never guessed. */
export function parseState(search: string): FinderState {
  const params = new URLSearchParams(search);
  const state: FinderState = { ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [] };
  const sort = sortById(params.get("sort") ?? "");
  if (sort !== null && !sortIsSpoiler(sort)) state.sort = sort.id;
  state.fromYear = year(params.get("from"));
  state.toYear = year(params.get("to"));
  const kind = params.get("kind");
  if (kind === "numbered" || kind === "nights") state.kind = kind;
  state.weightClasses = (params.get("class") ?? "")
    .split(",")
    .filter((wc) => (WEIGHT_CLASSES as readonly string[]).includes(wc));
  state.flags = (params.get("has") ?? "").split(",").filter(isFlagId);
  const country = params.get("country");
  if (country !== null && /^[a-z]{2}(-[a-z]{3})?$/.test(country)) state.country = country;
  state.place = (params.get("place") ?? "").slice(0, 60);
  for (const part of (params.get("if") ?? "").split(";").slice(0, MAX_RULES)) {
    const [metric, op, raw] = part.split(":");
    const value = Number(raw);
    if (metric === undefined || !isMetricId(metric) || metricById(metric)?.spoiler) continue;
    if ((op !== "min" && op !== "max") || raw === undefined || raw === "" || !Number.isFinite(value)) continue;
    state.rules.push({ metric, op, value });
  }
  return state;
}

/** The query string of a state (without "?"); empty for the default. Never a result-based part. */
export function stateToSearch(state: FinderState): string {
  const params = new URLSearchParams();
  const sort = sortById(state.sort);
  if (sort !== null && !sortIsSpoiler(sort) && sort.id !== DEFAULT_STATE.sort) params.set("sort", sort.id);
  if (state.fromYear !== null) params.set("from", String(state.fromYear));
  if (state.toYear !== null) params.set("to", String(state.toYear));
  if (state.kind !== "all") params.set("kind", state.kind);
  if (state.weightClasses.length > 0) params.set("class", state.weightClasses.join(","));
  if (state.flags.length > 0) params.set("has", state.flags.join(","));
  if (state.country !== null) params.set("country", state.country);
  if (state.place.trim() !== "") params.set("place", state.place.trim());
  const rules = state.rules.filter((rule) => !metricById(rule.metric)?.spoiler);
  if (rules.length > 0) params.set("if", rules.map((r) => `${r.metric}:${r.op}:${r.value}`).join(";"));
  return params.toString();
}

/** A state with every result-based part removed (when the visitor locks the spoilers again). */
export function withoutSpoilers(state: FinderState): FinderState {
  const sort = sortById(state.sort);
  return {
    ...state,
    sort: sort !== null && sortIsSpoiler(sort) ? DEFAULT_STATE.sort : state.sort,
    rules: state.rules.filter((rule) => !metricById(rule.metric)?.spoiler),
  };
}

/** Is anything chosen besides the default order? */
export function isFiltered(state: FinderState): boolean {
  return (
    state.fromYear !== null ||
    state.toYear !== null ||
    state.kind !== "all" ||
    state.weightClasses.length > 0 ||
    state.flags.length > 0 ||
    state.country !== null ||
    state.place.trim() !== "" ||
    state.rules.length > 0
  );
}

/** Quick starts. A spoiler preset only works once the result filters are unlocked. */
export interface Preset {
  id: string;
  label: string;
  spoiler: boolean;
  state: Partial<FinderState>;
}

export const PRESETS: readonly Preset[] = [
  { id: "best", label: "Best rated cards", spoiler: false, state: { sort: "cardRating" } },
  { id: "stacked", label: "Stacked with ranked fighters", spoiler: false, state: { sort: "top5Fighters" } },
  { id: "even", label: "Evenly matched on Elo", spoiler: false, state: { sort: "evenFights" } },
  { id: "titles", label: "Title nights", spoiler: false, state: { sort: "cardRating", flags: ["title"] } },
  { id: "five", label: "Five-round fights", spoiler: false, state: { sort: "fiveRoundFights" } },
  { id: "rematches", label: "Rematch cards", spoiler: false, state: { sort: "cardRating", flags: ["rematch"] } },
  { id: "knockouts", label: "Knockout nights", spoiler: true, state: { sort: "knockouts" } },
  { id: "submissions", label: "Tapout nights", spoiler: true, state: { sort: "submissions" } },
  { id: "quick", label: "Quick nights", spoiler: true, state: { sort: "shortestCard" } },
  { id: "upsets", label: "Upset alerts", spoiler: true, state: { sort: "upsets" } },
];

export function applyPreset(preset: Preset): FinderState {
  return { ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [], ...preset.state };
}
