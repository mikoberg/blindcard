import type { EventFacets } from "./types";

/** A row of the `event_facets` view (public, pre-fight facts only). */
export interface FacetRow {
  event_id: string;
  title_fights: unknown;
  five_round_fights: unknown;
  womens_fights: unknown;
  rematches: unknown;
  longest_streak: unknown;
  even_fights: unknown;
  elo_gap_avg: unknown;
  elo_avg: unknown;
  elo_peak: unknown;
  ranked_fighters: unknown;
  champions: unknown;
  top5_fighters: unknown;
  ranked_bouts: unknown;
  weight_classes: unknown;
  countries: unknown;
}

function count(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

function optional(value: unknown): number | null {
  return value === null || value === undefined ? null : count(value);
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** null when the row does not have the expected shape: the event then simply has no facets. */
export function toFacets(row: FacetRow): EventFacets | null {
  const titleFights = count(row.title_fights);
  const fiveRoundFights = count(row.five_round_fights);
  const womensFights = count(row.womens_fights);
  const rematches = count(row.rematches);
  const longestStreak = count(row.longest_streak ?? 0);
  const evenFights = count(row.even_fights);
  const rankedFighters = count(row.ranked_fighters);
  const champions = count(row.champions);
  const top5Fighters = count(row.top5_fighters);
  const rankedBouts = count(row.ranked_bouts);
  if (
    titleFights === null ||
    fiveRoundFights === null ||
    womensFights === null ||
    rematches === null ||
    longestStreak === null ||
    evenFights === null ||
    rankedFighters === null ||
    champions === null ||
    top5Fighters === null ||
    rankedBouts === null
  ) {
    return null;
  }
  return {
    titleFights,
    fiveRoundFights,
    womensFights,
    rematches,
    longestStreak,
    evenFights,
    eloGapAvg: optional(row.elo_gap_avg),
    eloAvg: optional(row.elo_avg),
    eloPeak: optional(row.elo_peak),
    rankedFighters,
    champions,
    top5Fighters,
    rankedBouts,
    weightClasses: texts(row.weight_classes),
    countries: texts(row.countries).filter((c) => /^[a-z]{2}(-[a-z]{3})?$/.test(c)),
  };
}
