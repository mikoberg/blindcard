/**
 * A fighter's Elo going INTO a bout (for a coming bout: today's rating). Pre-fight data of the same
 * kind as the record going in: it is computed from earlier fights only, and the cards never show a
 * rating after a fight or a change. See CLAUDE.md.
 */
export interface FighterElo {
  rating: number;
  /** How many earlier fights the rating rests on. */
  fights: number;
  /**
   * The highest rating they reached and the ISO date of that fight. Only a fighter's own page
   * carries it (it comes with the standing as of today); the cards never do.
   */
  peak?: { rating: number; date: string };
}

/** Under this many earlier fights a rating is mostly the starting value plus luck. */
export const PROVISIONAL_BELOW = 5;

/** Two ratings closer than this make an evenly matched fight (about 57/43 expected). */
export const EVEN_BELOW = 50;

export function isProvisional(elo: FighterElo): boolean {
  return elo.fights < PROVISIONAL_BELOW;
}

/** A rating from the database; anything unexpected is unknown, never a guess. */
export function toFighterElo(value: unknown): FighterElo | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as { r?: unknown; n?: unknown; pk?: unknown; pd?: unknown };
  const rating = typeof o.r === "string" ? Number(o.r) : o.r;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 500 || rating > 3000) return null;
  if (typeof o.n !== "number" || !Number.isInteger(o.n) || o.n < 1) return null;
  const peak = typeof o.pk === "string" ? Number(o.pk) : o.pk;
  if (typeof peak === "number" && Number.isFinite(peak) && peak >= rating && peak <= 3000) {
    if (typeof o.pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.pd)) {
      return { rating, fights: o.n, peak: { rating: peak, date: o.pd } };
    }
  }
  return { rating, fights: o.n };
}

export interface EloGap {
  /** Rating points between the two fighters, rounded. */
  points: number;
  /** Close enough to call the fight evenly matched. */
  even: boolean;
}

/**
 * How far apart the two ratings are, only when both rest on enough fights: a gap between a veteran
 * and a newcomer would claim more than the numbers know.
 */
export function eloGap(a: FighterElo | null | undefined, b: FighterElo | null | undefined): EloGap | null {
  if (!a || !b || isProvisional(a) || isProvisional(b)) return null;
  const points = Math.round(Math.abs(a.rating - b.rating));
  return { points, even: points < EVEN_BELOW };
}
