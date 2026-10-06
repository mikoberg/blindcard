import { isClassic } from "@/lib/card/classic";
import { isHiddenGemRating } from "@/lib/card/hiddenGem";
import type { ExploreEvent, ResultFacets } from "./types";

/**
 * Everything a card can be sorted or filtered on. A metric is either public (computed from pre-fight
 * facts and the star ratings: safe on the page) or a spoiler (computed from results: only usable
 * after the visitor has unlocked it, see CLAUDE.md).
 */
export type MetricId =
  // public
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
  | "longestStreak"
  // spoilers
  | "knockouts"
  | "submissions"
  | "decisions"
  | "splitDecisions"
  | "finishes"
  | "finishRate"
  | "roundOneFinishes"
  | "cardMinutes"
  | "fastestFinish"
  | "knockdowns"
  | "strikePace"
  | "takedowns"
  | "subAttempts"
  | "upsets"
  | "awards";

export type MetricGroup = "Ratings" | "Elo" | "UFC ranks" | "The card" | "How the fights ended";

export interface Metric {
  id: MetricId;
  /** Short noun phrase, used in a condition ("Knockouts at least 4"). */
  label: string;
  group: MetricGroup;
  /** true: computed from results; usable only after the visitor unlocks the spoiler filters. */
  spoiler: boolean;
  value: (event: ExploreEvent, results: ResultFacets | undefined) => number | null;
  format: (value: number) => string;
  /** Step of the number field in a condition. */
  step: number;
}

const count = (n: number): string => String(Math.round(n));
const one = (n: number): string => n.toFixed(1);
const elo = (n: number): string => String(Math.round(n));

/** 3725 seconds -> "1h 02m"; under an hour "58m". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

/** 57 -> "0:57". */
export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function stars(event: ExploreEvent): number[] {
  return event.ratings.map((slot) => slot.stars);
}

const fromFacets =
  (pick: (facets: NonNullable<ExploreEvent["facets"]>) => number | null) =>
  (event: ExploreEvent): number | null =>
    event.facets === null ? null : pick(event.facets);

const fromResults =
  (pick: (results: ResultFacets) => number | null) =>
  (_event: ExploreEvent, results: ResultFacets | undefined): number | null =>
    results === undefined ? null : pick(results);

function metric(
  id: MetricId,
  label: string,
  group: MetricGroup,
  spoiler: boolean,
  value: Metric["value"],
  format: Metric["format"],
  step = 1,
): Metric {
  return { id, label, group, spoiler, value, format, step };
}

export const METRICS: readonly Metric[] = [
  metric("cardRating", "Card rating", "Ratings", false, (e) => {
    const all = stars(e);
    return all.length === 0 ? null : all.reduce((sum, s) => sum + s, 0) / all.length;
  }, one, 0.1),
  metric("bestFight", "Best fight rating", "Ratings", false, (e) => {
    const all = stars(e);
    return all.length === 0 ? null : Math.max(...all);
  }, one, 0.5),
  metric("mainEventRating", "Main event rating", "Ratings", false, (e) => {
    const main = e.ratings.find((slot) => slot.position === 1);
    return main ? main.stars : null;
  }, one, 0.5),
  metric("greatFights", "Fights rated 4.5 or more", "Ratings", false, (e) => {
    const all = stars(e);
    return all.length === 0 ? null : all.filter((s) => s >= 4.5).length;
  }, count),
  metric("classics", "Classics (5.0)", "Ratings", false, (e) => (e.ratings.length === 0 ? null : e.ratings.filter((s) => isClassic(s.stars)).length), count),
  metric("hiddenGems", "Hidden gems", "Ratings", false, (e) => (e.ratings.length === 0 ? null : e.ratings.filter((s) => isHiddenGemRating(s.stars, s.position)).length), count),
  metric("ratedFights", "Rated fights", "The card", false, (e) => e.ratings.length, count),

  metric("eloAvg", "Average Elo going in", "Elo", false, fromFacets((f) => f.eloAvg), elo, 10),
  metric("eloPeak", "Highest Elo going in", "Elo", false, fromFacets((f) => f.eloPeak), elo, 10),
  metric("eloGapAvg", "Average Elo gap per fight", "Elo", false, fromFacets((f) => f.eloGapAvg), elo, 10),
  metric("evenFights", "Evenly matched fights", "Elo", false, fromFacets((f) => f.evenFights), count),

  metric("rankedFighters", "Ranked fighters", "UFC ranks", false, fromFacets((f) => f.rankedFighters), count),
  metric("top5Fighters", "Top 5 fighters", "UFC ranks", false, fromFacets((f) => f.top5Fighters), count),
  metric("champions", "Champions", "UFC ranks", false, fromFacets((f) => f.champions), count),
  metric("rankedBouts", "Ranked against ranked", "UFC ranks", false, fromFacets((f) => f.rankedBouts), count),

  metric("titleFights", "Title fights", "The card", false, fromFacets((f) => f.titleFights), count),
  metric("fiveRoundFights", "Five-round fights", "The card", false, fromFacets((f) => f.fiveRoundFights), count),
  metric("womensFights", "Women's fights", "The card", false, fromFacets((f) => f.womensFights), count),
  metric("rematches", "Rematches", "The card", false, fromFacets((f) => f.rematches), count),
  metric("longestStreak", "Longest win streak going in", "The card", false, fromFacets((f) => f.longestStreak), count),

  metric("knockouts", "Knockouts", "How the fights ended", true, fromResults((r) => r.knockouts), count),
  metric("submissions", "Submissions", "How the fights ended", true, fromResults((r) => r.submissions), count),
  metric("decisions", "Decisions", "How the fights ended", true, fromResults((r) => r.decisions), count),
  metric("splitDecisions", "Split decisions", "How the fights ended", true, fromResults((r) => r.splitDecisions), count),
  metric("finishes", "Finishes", "How the fights ended", true, fromResults((r) => r.knockouts + r.submissions), count),
  metric("finishRate", "Finish rate (%)", "How the fights ended", true, fromResults((r) => (r.fights === 0 ? null : ((r.knockouts + r.submissions) / r.fights) * 100)), count, 5),
  metric("roundOneFinishes", "First-round finishes", "How the fights ended", true, fromResults((r) => r.roundOneFinishes), count),
  metric("cardMinutes", "Time the card ran (minutes)", "How the fights ended", true, fromResults((r) => r.totalSeconds / 60), formatMinutes, 10),
  metric("fastestFinish", "Fastest finish (seconds)", "How the fights ended", true, fromResults((r) => r.fastestFinishSeconds), formatClock, 10),
  metric("knockdowns", "Knockdowns", "How the fights ended", true, fromResults((r) => r.knockdowns), count),
  metric("strikePace", "Strikes landed per minute", "How the fights ended", true, fromResults((r) => (r.totalSeconds === 0 ? null : r.strikes / (r.totalSeconds / 60))), one, 0.5),
  metric("takedowns", "Takedowns", "How the fights ended", true, fromResults((r) => r.takedowns), count),
  metric("subAttempts", "Attempted submissions", "How the fights ended", true, fromResults((r) => r.subAttempts), count),
  metric("upsets", "Upsets by Elo", "How the fights ended", true, fromResults((r) => r.upsets), count),
  metric("awards", "Bonus awards", "How the fights ended", true, fromResults((r) => r.bonuses), count),
];

const BY_ID: ReadonlyMap<MetricId, Metric> = new Map(METRICS.map((m) => [m.id, m]));

export function metricById(id: string): Metric | null {
  return BY_ID.get(id as MetricId) ?? null;
}

export function isMetricId(id: string): id is MetricId {
  return BY_ID.has(id as MetricId);
}

/** How the list is ordered. `date` has no metric: it is the event date. */
export interface SortOption {
  id: string;
  label: string;
  /** null = the event date. */
  metric: MetricId | null;
  order: "desc" | "asc";
}

function sort(id: string, label: string, metric: MetricId | null, order: "desc" | "asc" = "desc"): SortOption {
  return { id, label, metric, order };
}

export const SORTS: readonly SortOption[] = [
  sort("newest", "Newest first", null),
  sort("oldest", "Oldest first", null, "asc"),
  sort("cardRating", "Best card rating", "cardRating"),
  sort("bestFight", "Best single fight", "bestFight"),
  sort("greatFights", "Most fights rated 4.5 or more", "greatFights"),
  sort("classics", "Most classics", "classics"),
  sort("hiddenGems", "Most hidden gems", "hiddenGems"),
  sort("mainEventRating", "Best main event", "mainEventRating"),
  sort("eloAvg", "Highest average Elo", "eloAvg"),
  sort("eloPeak", "Highest-rated fighter (Elo)", "eloPeak"),
  sort("evenFights", "Most evenly matched fights", "evenFights"),
  sort("eloGapAvg", "Closest matchups (smallest Elo gap)", "eloGapAvg", "asc"),
  sort("rankedFighters", "Most ranked fighters", "rankedFighters"),
  sort("top5Fighters", "Most top 5 fighters", "top5Fighters"),
  sort("champions", "Most champions", "champions"),
  sort("rankedBouts", "Most ranked-versus-ranked fights", "rankedBouts"),
  sort("titleFights", "Most title fights", "titleFights"),
  sort("fiveRoundFights", "Most five-round fights", "fiveRoundFights"),
  sort("womensFights", "Most women's fights", "womensFights"),
  sort("rematches", "Most rematches", "rematches"),
  sort("longestStreak", "Longest win streak going in", "longestStreak"),
  sort("knockouts", "Most knockouts", "knockouts"),
  sort("submissions", "Most submissions", "submissions"),
  sort("decisions", "Most decisions", "decisions"),
  sort("splitDecisions", "Most split decisions", "splitDecisions"),
  sort("finishes", "Most finishes", "finishes"),
  sort("finishRate", "Highest finish rate", "finishRate"),
  sort("roundOneFinishes", "Most first-round finishes", "roundOneFinishes"),
  sort("shortestCard", "Shortest card (fight time)", "cardMinutes", "asc"),
  sort("longestCard", "Longest card (fight time)", "cardMinutes"),
  sort("fastestFinish", "Fastest single finish", "fastestFinish", "asc"),
  sort("knockdowns", "Most knockdowns", "knockdowns"),
  sort("strikePace", "Highest strike pace", "strikePace"),
  sort("takedowns", "Most takedowns", "takedowns"),
  sort("subAttempts", "Most submission attempts", "subAttempts"),
  sort("upsets", "Most upsets by Elo", "upsets"),
  sort("awards", "Most bonus awards", "awards"),
];

const SORT_BY_ID: ReadonlyMap<string, SortOption> = new Map(SORTS.map((s) => [s.id, s]));

export function sortById(id: string): SortOption | null {
  return SORT_BY_ID.get(id) ?? null;
}

/** true when ordering by this needs result data. */
export function sortIsSpoiler(option: SortOption): boolean {
  return option.metric !== null && (metricById(option.metric)?.spoiler ?? false);
}

/**
 * Things a card can simply be required to have. Each is "at least one" of a metric, so they are
 * shortcuts for a condition and public (a result-based one would be a condition).
 */
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
