import { isClassic } from "@/lib/card/classic";
import { isHiddenGemRating } from "@/lib/card/hiddenGem";
import type { ExploreEvent } from "./types";

/**
 * Everything a card can be ordered or filtered on. All of it is public: the star ratings and sums of
 * pre-fight facts (the Elo and UFC ranks going in, title fights, rematches and so on). Nothing here is
 * built from a result.
 */
export type MetricId =
  | "cardRating"
  | "bestFight"
  | "mainEventRating"
  | "greatFights"
  | "classics"
  | "hiddenGems"
  | "ratedFights"
  | "eloAvg"
  | "eloPeak"
  | "eloGapAvg"
  | "evenFights"
  | "rankedFighters"
  | "top5Fighters"
  | "champions"
  | "rankedBouts"
  | "titleFights"
  | "fiveRoundFights"
  | "womensFights"
  | "rematches"
  | "longestStreak";

export type MetricGroup = "Ratings" | "Elo" | "UFC ranks" | "The card";

export interface Metric {
  id: MetricId;
  /** Short noun phrase, used in a condition ("Average Elo at least 1600"). */
  label: string;
  group: MetricGroup;
  value: (event: ExploreEvent) => number | null;
  format: (value: number) => string;
  /** Step of the number field in a condition. */
  step: number;
}

const count = (n: number): string => String(Math.round(n));
const one = (n: number): string => n.toFixed(1);
const elo = (n: number): string => String(Math.round(n));

function stars(event: ExploreEvent): number[] {
  return event.ratings.map((slot) => slot.stars);
}

const fromFacets =
  (pick: (facets: NonNullable<ExploreEvent["facets"]>) => number | null) =>
  (event: ExploreEvent): number | null =>
    event.facets === null ? null : pick(event.facets);

function metric(
  id: MetricId,
  label: string,
  group: MetricGroup,
  value: Metric["value"],
  format: Metric["format"],
  step = 1,
): Metric {
  return { id, label, group, value, format, step };
}

export const METRICS: readonly Metric[] = [
  metric("cardRating", "Card rating", "Ratings", (e) => {
    const all = stars(e);
    return all.length === 0 ? null : all.reduce((sum, s) => sum + s, 0) / all.length;
  }, one, 0.1),
  metric("bestFight", "Best fight rating", "Ratings", (e) => {
    const all = stars(e);
    return all.length === 0 ? null : Math.max(...all);
  }, one, 0.5),
  metric("mainEventRating", "Main event rating", "Ratings", (e) => {
    const main = e.ratings.find((slot) => slot.position === 1);
    return main ? main.stars : null;
  }, one, 0.5),
  metric("greatFights", "Fights rated 4.5 or more", "Ratings", (e) => {
    const all = stars(e);
    return all.length === 0 ? null : all.filter((s) => s >= 4.5).length;
  }, count),
  metric("classics", "Classics (5.0)", "Ratings", (e) => (e.ratings.length === 0 ? null : e.ratings.filter((s) => isClassic(s.stars)).length), count),
  metric("hiddenGems", "Hidden gems", "Ratings", (e) => (e.ratings.length === 0 ? null : e.ratings.filter((s) => isHiddenGemRating(s.stars, s.position)).length), count),
  metric("ratedFights", "Rated fights", "The card", (e) => e.ratings.length, count),

  metric("eloAvg", "Average Elo going in", "Elo", fromFacets((f) => f.eloAvg), elo, 10),
  metric("eloPeak", "Highest Elo going in", "Elo", fromFacets((f) => f.eloPeak), elo, 10),
  metric("eloGapAvg", "Average Elo gap per fight", "Elo", fromFacets((f) => f.eloGapAvg), elo, 10),
  metric("evenFights", "Evenly matched fights", "Elo", fromFacets((f) => f.evenFights), count),

  metric("rankedFighters", "Ranked fighters", "UFC ranks", fromFacets((f) => f.rankedFighters), count),
  metric("top5Fighters", "Top 5 fighters", "UFC ranks", fromFacets((f) => f.top5Fighters), count),
  metric("champions", "Champions", "UFC ranks", fromFacets((f) => f.champions), count),
  metric("rankedBouts", "Ranked against ranked", "UFC ranks", fromFacets((f) => f.rankedBouts), count),

  metric("titleFights", "Title fights", "The card", fromFacets((f) => f.titleFights), count),
  metric("fiveRoundFights", "Five-round fights", "The card", fromFacets((f) => f.fiveRoundFights), count),
  metric("womensFights", "Women's fights", "The card", fromFacets((f) => f.womensFights), count),
  metric("rematches", "Rematches", "The card", fromFacets((f) => f.rematches), count),
  metric("longestStreak", "Longest win streak going in", "The card", fromFacets((f) => f.longestStreak), count),
];

const BY_ID: ReadonlyMap<MetricId, Metric> = new Map(METRICS.map((m) => [m.id, m]));

export function metricById(id: string): Metric | null {
  return BY_ID.get(id as MetricId) ?? null;
}

export function isMetricId(id: string): id is MetricId {
  return BY_ID.has(id as MetricId);
}

/** How the list is ordered. */
export interface SortOption {
  id: string;
  label: string;
  group: "Date" | MetricGroup;
  /** null = the event date. */
  metric: MetricId | null;
  order: "desc" | "asc";
}

function sort(
  id: string,
  label: string,
  group: SortOption["group"],
  metric: MetricId | null,
  order: "desc" | "asc" = "desc",
): SortOption {
  return { id, label, group, metric, order };
}

export const SORTS: readonly SortOption[] = [
  sort("newest", "Newest first", "Date", null),
  sort("oldest", "Oldest first", "Date", null, "asc"),
  sort("cardRating", "Best card rating", "Ratings", "cardRating"),
  sort("bestFight", "Best single fight", "Ratings", "bestFight"),
  sort("greatFights", "Most fights rated 4.5 or more", "Ratings", "greatFights"),
  sort("classics", "Most classics", "Ratings", "classics"),
  sort("hiddenGems", "Most hidden gems", "Ratings", "hiddenGems"),
  sort("mainEventRating", "Best main event", "Ratings", "mainEventRating"),
  sort("eloAvg", "Highest average Elo", "Elo", "eloAvg"),
  sort("eloPeak", "Highest-rated fighter (Elo)", "Elo", "eloPeak"),
  sort("evenFights", "Most evenly matched fights", "Elo", "evenFights"),
  sort("eloGapAvg", "Closest matchups (smallest Elo gap)", "Elo", "eloGapAvg", "asc"),
  sort("rankedFighters", "Most ranked fighters", "UFC ranks", "rankedFighters"),
  sort("top5Fighters", "Most top 5 fighters", "UFC ranks", "top5Fighters"),
  sort("champions", "Most champions", "UFC ranks", "champions"),
  sort("rankedBouts", "Most ranked-versus-ranked fights", "UFC ranks", "rankedBouts"),
  sort("titleFights", "Most title fights", "The card", "titleFights"),
  sort("fiveRoundFights", "Most five-round fights", "The card", "fiveRoundFights"),
  sort("womensFights", "Most women's fights", "The card", "womensFights"),
  sort("rematches", "Most rematches", "The card", "rematches"),
  sort("longestStreak", "Longest win streak going in", "The card", "longestStreak"),
];

const SORT_BY_ID: ReadonlyMap<string, SortOption> = new Map(SORTS.map((s) => [s.id, s]));

export function sortById(id: string): SortOption | null {
  return SORT_BY_ID.get(id) ?? null;
}

/** Things a card can simply be required to have: "at least one" of a metric. */
export const FLAGS = [
  { id: "title", label: "A title fight", metric: "titleFights" },
  { id: "champion", label: "A champion", metric: "champions" },
  { id: "fiveRound", label: "A five-round fight", metric: "fiveRoundFights" },
  { id: "women", label: "A women's fight", metric: "womensFights" },
  { id: "rematch", label: "A rematch", metric: "rematches" },
  { id: "classic", label: "A classic (5.0)", metric: "classics" },
  { id: "gem", label: "A hidden gem", metric: "hiddenGems" },
  { id: "rankedBout", label: "Ranked against ranked", metric: "rankedBouts" },
] as const satisfies readonly { id: string; label: string; metric: MetricId }[];

export type FlagId = (typeof FLAGS)[number]["id"];

export function isFlagId(id: string): id is FlagId {
  return FLAGS.some((flag) => flag.id === id);
}

/** The weight classes of the divisions, in the order of the list. */
export const WEIGHT_CLASSES = [
  "Heavyweight",
  "Light Heavyweight",
  "Middleweight",
  "Welterweight",
  "Lightweight",
  "Featherweight",
  "Bantamweight",
  "Flyweight",
  "Women's Featherweight",
  "Women's Bantamweight",
  "Women's Flyweight",
  "Women's Strawweight",
] as const;
