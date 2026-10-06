import type { FighterElo } from "@/lib/card/elo";
import type { FighterRecord } from "@/lib/card/types";

/** One row of the `fighter_ratings` view: a fighter and how their rated fights score. */
export interface FighterRatingRow {
  id: string;
  name: string;
  country: string | null;
  rated_fights: number;
  /** Average of the active version's star ratings of their fights. */
  avg_stars: number | string;
  slug: string;
  /** ISO date of their latest rated fight. */
  last_fight?: string | null;
}

/** One row of the `fighter_fights` view: a rated fight of one fighter. */
export interface FighterFightRow {
  event_slug: string;
  event_name: string;
  event_date: string;
  opponent_name: string;
  stars: number | string;
  fight_id?: string | null;
  weight_class?: string | null;
  is_title_fight?: boolean | null;
  opponent_slug?: string | null;
}

/** A fighter's standing as of today, from the `fighters` row: styles, record and Elo. */
export interface FighterNowRow {
  style?: unknown;
  record?: unknown;
  elo?: unknown;
  awards?: unknown;
  birth_date?: unknown;
}

/** A rated fight as the fighter page lists it. */
export interface FighterFight {
  eventSlug: string;
  eventName: string;
  eventDate: string;
  opponent: string;
  /** The opponent's page, when they have one. */
  opponentSlug: string | null;
  stars: number;
  /** For a link to the fight's place on its card. */
  fightId: string | null;
  weightClass: string | null;
  isTitleFight: boolean;
}

/** What the rated fights add up to: shown as a strip of figures under the name. */
export interface ProfileStats {
  rated: number;
  best: number;
  /** Fights rated 4.0 or higher. */
  fourPlus: number;
  firstYear: string;
  lastYear: string;
  /** Most fought first. */
  weightClasses: string[];
  titleFights: number;
}

/**
 * Career totals of how a fighter's UFC fights in our data ended, as of today: wins by knockout,
 * submission and decision, first-round finishes, title fights, and what they landed or tried.
 */
export interface FighterTally {
  fights: number;
  /** Victories (named so, to keep the plain word out of every page's data). */
  victories: number;
  ko: number;
  sub: number;
  dec: number;
  r1: number;
  title: number;
  kd: number;
  sig: number;
  td: number;
  sa: number;
}

/** Career totals of the two night bonuses. */
export interface FighterAwards {
  fotn: number;
  potn: number;
}

export interface FighterProfile {
  name: string;
  country: string | null;
  slug: string;
  /** Average of the ratings of `fights`, as the leaderboard shows it. */
  average: number;
  /** Fighting styles (Kickboxing, Wrestling, ...); empty when not known. */
  styles: string[];
  /**
   * The record as of today, including the latest fight, like the record on an announced bout. A
   * current standing only: never listed fight by fight. null when not reliable.
   */
  record: FighterRecord | null;
  /** The Elo as of today, same rule as the record. null for a fighter without an earlier fight. */
  elo: FighterElo | null;
  /**
   * How many Fight / Performance of the Night bonuses they have earned (from 2015 on, the years we hold
   * the awards for), as one total as of today, like the record. Never listed fight by fight.
   */
  awards: FighterAwards | null;
  /** ISO date of birth (a public fact from their Wikipedia or Sherdog page); null when not known. */
  born: string | null;
  stats: ProfileStats;
  /** Newest first. */
  fights: FighterFight[];
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  /** Average of their fights' ratings. */
  average: number;
  /** ISO date of their latest rated fight; null when unknown. */
  lastFight: string | null;
  /** Night-bonus totals, when we hold awards for them. */
  awards: FighterAwards | null;
  /** How their fights ended, added up, when we hold it. */
  tally: FighterTally | null;
}

/** A fighter found by the search, ranked or not. */
export interface FighterSearchResult {
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  average: number;
}
