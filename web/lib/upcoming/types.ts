import type { FighterElo } from "@/lib/card/elo";
import type { FighterRecord } from "@/lib/card/types";

/** A fighter on an upcoming card. Linked to a stored fighter only when exactly one matched. */
export interface UpcomingFighter {
  name: string;
  /** Slug of the fighter's page, when the name matched exactly one stored fighter. */
  slug: string | null;
  country: string | null;
  /** The record going into this bout (as it stands today); null when not known. */
  record: FighterRecord | null;
  /** Fighting styles from the fighter's page (Kickboxing, Wrestling, ...); empty when not known. */
  styles: string[];
  /** Today's Elo rating (see lib/card/elo.ts); null when the fighter has no earlier fight here. */
  elo?: FighterElo | null;
}

/** A reason behind an expected rating: what moved it, in stars, against an average fight. */
export interface PredictionReason {
  label: string;
  amount: number;
}

/**
 * The expected rating of a bout that has not been fought: a number on the same scale as a real
 * rating, learned from public ratings only. `basis` says how much history it rests on.
 */
export interface BoutPrediction {
  stars: number;
  basis: "both" | "one" | "none";
  why: PredictionReason[];
}

export type UpcomingSegment = "main" | "prelim" | "early_prelim";

/** One announced bout. Pre-fight facts only: no record, streak or rating-of-the-fight yet. */
export interface UpcomingBout {
  id: string;
  /** 1 = the main event. */
  position: number;
  segment: UpcomingSegment | null;
  weightClass: string | null;
  isTitleFight: boolean;
  a: UpcomingFighter;
  b: UpcomingFighter;
  /** null until the model has run for this bout. */
  prediction: BoutPrediction | null;
  /** A favourite exists for this bout. Who it is stays private until the visitor clicks. */
  hasPick: boolean;
}

export interface UpcomingEvent {
  id: string;
  slug: string;
  name: string;
  /** ISO date, e.g. "2026-10-24". */
  eventDate: string;
  location: string | null;
  /** Start times (ISO, UTC) from the official event page; null = not announced yet. */
  mainCardAt: string | null;
  prelimsAt: string | null;
  earlyPrelimsAt: string | null;
  /** In card order; empty while the card is not announced. */
  bouts: UpcomingBout[];
}
