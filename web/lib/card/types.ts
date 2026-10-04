export interface CardFighter {
  id: string;
  name: string;
}

export interface Rating {
  /** 1.0 to 5.0 in half-star steps. */
  stars: number;
  /** 0 to 100, used only as a tie-break. */
  percentile: number;
}

/** What was known about a fighter before the bout (from earlier bouts only). */
export interface FighterCareer {
  /** Wins in a row going into the bout. */
  streak: number;
  /** No UFC loss, after at least a few fights. */
  unbeaten: boolean;
}

/** What was known about the two fighters before the bout: a pre-fight fact. */
export interface FightCareer {
  /** How often the two met before. */
  meetings: number;
  a: FighterCareer;
  b: FighterCareer;
}

/** Which part of the card a fight was on. A pre-fight fact (the running order is announced). */
export type CardSegment = "main" | "prelim" | "early_prelim";

export interface CardFight {
  id: string;
  /** 1 = main event. */
  cardPosition: number;
  /** null = unknown: the event's segments could not be established completely. */
  cardSegment: CardSegment | null;
  /** null = not computed. */
  career: FightCareer | null;
  weightClass: string | null;
  isTitleFight: boolean;
  scheduledRounds: number | null;
  fighterA: CardFighter;
  fighterB: CardFighter;
  /** null means "Not rated yet" (unprocessed and unscorable fights look identical). */
  rating: Rating | null;
}

export interface CardEvent {
  id: string;
  name: string;
  slug: string;
  /** ISO date, e.g. "2026-09-26". */
  eventDate: string;
  location: string | null;
}

export type SortMode = "card" | "rating";
