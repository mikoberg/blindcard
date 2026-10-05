import type { FighterRatingRow, LeaderboardEntry } from "./types";

/**
 * A fighter needs this many rated fights to be ranked, so a couple of lucky fights cannot put
 * anyone on top.
 */
export const MIN_FIGHTS = 8;

/**
 * Fighters ranked by the plain average of their fights' ratings (best first; ties go to the
 * fighter with more fights). Only public, active-version ratings.
 */
export function rankFighters(rows: readonly FighterRatingRow[]): LeaderboardEntry[] {
  return rows
    .map((row) => ({ row, average: Number(row.avg_stars), fights: row.rated_fights }))
    .filter(
      (r) =>
        Number.isFinite(r.average) && Number.isInteger(r.fights) && r.fights >= MIN_FIGHTS,
    )
    .sort(
      (a, b) =>
        b.average - a.average ||
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
