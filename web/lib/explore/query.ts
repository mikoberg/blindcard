import {
  FLAGS,
  WEIGHT_CLASSES,
  isFlagId,
  isMetricId,
  metricById,
  sortById,
  type FlagId,
  type MetricId,
} from "./metrics";
import type { ExploreEvent } from "./types";

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

/** A fresh default state (the arrays are never shared). */
export function freshState(patch: Partial<FinderState> = {}): FinderState {
  return { ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [], ...patch };
}

const isNumbered = (event: ExploreEvent): boolean => /^UFC\s+\d+/i.test(event.name);

function yearOf(event: ExploreEvent): number {
  return Number(event.eventDate.slice(0, 4));
}

export interface FinderOutcome {
  matches: ExploreEvent[];
  /** The metric the list is ordered by, to show its value under each card (null: the date). */
  shown: MetricId | null;
}

function matches(event: ExploreEvent, state: FinderState): boolean {
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
    const value = flag ? (metricById(flag.metric)?.value(event) ?? null) : null;
    if (value === null || value < 1) return false;
  }
  for (const rule of state.rules) {
    const value = metricById(rule.metric)?.value(event) ?? null;
    if (value === null || !Number.isFinite(rule.value)) return false;
    if (rule.op === "min" ? value < rule.value : value > rule.value) return false;
  }
  return true;
}

/** Filters and orders the events. A card with no value for the order goes last, whichever way it runs. */
export function runFinder(events: readonly ExploreEvent[], state: FinderState): FinderOutcome {
  const filtered = events.filter((event) => matches(event, state));
  const option = sortById(state.sort) ?? sortById("cardRating");
  if (option === null) return { matches: filtered, shown: null };
  const metric = option.metric === null ? null : metricById(option.metric);
  const direction = option.order === "desc" ? -1 : 1;
  const keyed = filtered.map((event) => ({ event, key: metric ? metric.value(event) : null }));
  keyed.sort((a, b) => {
    if (metric === null) {
      return direction * a.event.eventDate.localeCompare(b.event.eventDate) || a.event.id.localeCompare(b.event.id);
    }
    if (a.key === null && b.key !== null) return 1;
    if (a.key !== null && b.key === null) return -1;
    const byValue = a.key === null || b.key === null ? 0 : direction * (a.key - b.key);
    return byValue || b.event.eventDate.localeCompare(a.event.eventDate) || a.event.id.localeCompare(b.event.id);
  });
  return { matches: keyed.map((row) => row.event), shown: metric ? metric.id : null };
}

// ---------------------------------------------------------------------------------------------
// The address bar: a link carries the whole state, so a search can be shared.

const FIRST_YEAR = 1993;

function year(value: string | null): number | null {
  if (value === null || !/^\d{4}$/.test(value)) return null;
  const n = Number(value);
  return n >= FIRST_YEAR && n <= 2100 ? n : null;
}

/** Reads a finder state from a query string. Anything unknown is ignored, never guessed. */
export function parseState(search: string): FinderState {
  const params = new URLSearchParams(search);
  const state = freshState();
  const sort = sortById(params.get("sort") ?? "");
  if (sort !== null) state.sort = sort.id;
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
    if (metric === undefined || !isMetricId(metric)) continue;
    if ((op !== "min" && op !== "max") || raw === undefined || raw === "" || !Number.isFinite(value)) continue;
    state.rules.push({ metric, op, value });
  }
  return state;
}

/** The query string of a state (without "?"); empty for the default. */
export function stateToSearch(state: FinderState): string {
  const params = new URLSearchParams();
  if (state.sort !== DEFAULT_STATE.sort && sortById(state.sort) !== null) params.set("sort", state.sort);
  if (state.fromYear !== null) params.set("from", String(state.fromYear));
  if (state.toYear !== null) params.set("to", String(state.toYear));
  if (state.kind !== "all") params.set("kind", state.kind);
  if (state.weightClasses.length > 0) params.set("class", state.weightClasses.join(","));
  if (state.flags.length > 0) params.set("has", state.flags.join(","));
  if (state.country !== null) params.set("country", state.country);
  if (state.place.trim() !== "") params.set("place", state.place.trim());
  const rules = state.rules.filter((rule) => Number.isFinite(rule.value));
  if (rules.length > 0) params.set("if", rules.map((r) => `${r.metric}:${r.op}:${r.value}`).join(";"));
  return params.toString();
}

/** One chosen filter, as shown in the row of pills. `remove` gives the state without it. */
export interface Pill {
  key: string;
  label: string;
  remove: (state: FinderState) => FinderState;
}

/** The chosen filters (not the order), for the pills under the bar. */
export function pillsOf(state: FinderState, countryName: (code: string) => string): Pill[] {
  const pills: Pill[] = [];
  if (state.fromYear !== null || state.toYear !== null) {
    const from = state.fromYear ?? "";
    const to = state.toYear ?? "";
    pills.push({
      key: "years",
      label: state.fromYear !== null && state.toYear !== null ? `${from}–${to}` : state.fromYear !== null ? `From ${from}` : `Until ${to}`,
      remove: (s) => ({ ...s, fromYear: null, toYear: null }),
    });
  }
  if (state.kind !== "all") {
    pills.push({
      key: "kind",
      label: state.kind === "numbered" ? "Numbered events" : "Fight Nights",
      remove: (s) => ({ ...s, kind: "all" }),
    });
  }
  for (const id of state.flags) {
    const flag = FLAGS.find((f) => f.id === id);
    if (flag) pills.push({ key: `has-${id}`, label: flag.label, remove: (s) => ({ ...s, flags: s.flags.filter((f) => f !== id) }) });
  }
  for (const wc of state.weightClasses) {
    pills.push({ key: `wc-${wc}`, label: wc, remove: (s) => ({ ...s, weightClasses: s.weightClasses.filter((w) => w !== wc) }) });
  }
  if (state.country !== null) {
    const code = state.country;
    pills.push({ key: "country", label: `Fighter from ${countryName(code)}`, remove: (s) => ({ ...s, country: null }) });
  }
  if (state.place.trim() !== "") {
    pills.push({ key: "place", label: `In ${state.place.trim()}`, remove: (s) => ({ ...s, place: "" }) });
  }
  state.rules.forEach((rule, index) => {
    const metric = metricById(rule.metric);
    if (!metric || !Number.isFinite(rule.value)) return;
    pills.push({
      key: `rule-${index}`,
      label: `${metric.label} ${rule.op === "min" ? "≥" : "≤"} ${metric.format(rule.value)}`,
      remove: (s) => ({ ...s, rules: s.rules.filter((_, i) => i !== index) }),
    });
  });
  return pills;
}

/** Quick starts, offered while nothing is chosen. */
export interface Preset {
  id: string;
  label: string;
  state: Partial<FinderState>;
}

export const PRESETS: readonly Preset[] = [
  { id: "titles", label: "Title nights", state: { sort: "cardRating", flags: ["title"] } },
  { id: "stacked", label: "Stacked with ranked fighters", state: { sort: "top5Fighters" } },
  { id: "even", label: "Evenly matched on Elo", state: { sort: "evenFights" } },
  { id: "rematches", label: "Rematch cards", state: { sort: "cardRating", flags: ["rematch"] } },
];

export function applyPreset(preset: Preset): FinderState {
  return freshState(preset.state);
}
