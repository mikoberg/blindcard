import type { FighterRatingRow, LeaderboardEntry } from "./types";

/** A fighter needs this many rated fights to be ranked: one great fight is not a record. */
export const MIN_FIGHTS = 6;
/**
 * How many fights' worth of "ordinary" rating each fighter starts with. With few fights the
 * ranking value stays close to the overall mean, so a fighter climbs by delivering many good
 * fights, not by one lucky one.
 */
export const PRIOR_FIGHTS = 5;

/**
 * Fighters ranked by how worth watching their fights are. The order uses a damped average
 * ((sum of ratings + prior) / (fights + prior)); the entry carries the plain average and the
 * number of fights, which is what the page shows. Only public, active-version ratings.
 */
export function rankFighters(rows: readonly FighterRatingRow[]): LeaderboardEntry[] {
  const valid = rows
    .map((row) => ({ row, average: Number(row.avg_stars), fights: row.rated_fights }))
    .filter((r) => Number.isFinite(r.average) && Number.isInteger(r.fights) && r.fights > 0);
  const total = valid.reduce((sum, r) => sum + r.fights, 0);
  if (total === 0) return [];
  const mean = valid.reduce((sum, r) => sum + r.average * r.fights, 0) / total;

  const damped = (r: { average: number; fights: number }) =>
    (r.average * r.fights + mean * PRIOR_FIGHTS) / (r.fights + PRIOR_FIGHTS);

  return valid
    .filter((r) => r.fights >= MIN_FIGHTS)
    .sort(
      (a, b) =>
        damped(b) - damped(a) ||
        b.fights - a.fights ||
        a.row.name.localeCompare(b.row.name) ||
        a.row.id.localeCompare(b.row.id),
    )
    .map((r, index) => ({
      rank: index + 1,
      id: r.row.id,
      name: r.row.name,
      country: r.row.country,
      fights: r.fights,
      average: r.average,
    }));
}
