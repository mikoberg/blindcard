import { toFighterElo } from "@/lib/card/elo";
import { mapStyles, toRecord } from "@/lib/data/map";
import { isValidSlug } from "@/lib/slug";
import { profileStats } from "./profile";
import type {
  FighterFightRow,
  FighterNowRow,
  ProfileStats,
  FighterProfile,
  FighterRatingRow,
  FighterSearchResult,
  LeaderboardEntry,
} from "./types";

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
      slug: r.row.slug,
      name: r.row.name,
      country: r.row.country,
      fights: r.fights,
      average: r.average,
      lastFight: typeof r.row.last_fight === "string" ? r.row.last_fight : null,
    }));
}

/** Ratings can arrive as numbers or numeric strings; anything else is not a rating. */
function toStars(value: number | string): number | null {
  const stars = Number(value);
  return Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

/**
 * The fighter page: the rated fights behind the average, newest first, and the average computed
 * from exactly those fights (so what is listed always adds up to the number shown).
 */
export function buildProfile(
  fighter: Pick<FighterRatingRow, "name" | "country" | "slug">,
  rows: readonly FighterFightRow[],
  now: FighterNowRow = {},
): FighterProfile | null {
  const fights = rows
    .flatMap((row) => {
      const stars = toStars(row.stars);
      return stars === null
        ? []
        : [
            {
              eventSlug: row.event_slug,
              eventName: row.event_name,
              eventDate: row.event_date,
              opponent: row.opponent_name,
              opponentSlug: row.opponent_slug && isValidSlug(row.opponent_slug) ? row.opponent_slug : null,
              stars,
              fightId: row.fight_id ?? null,
              weightClass: row.weight_class ?? null,
              isTitleFight: row.is_title_fight === true,
            },
          ];
    })
    .sort(
      (a, b) =>
        b.eventDate.localeCompare(a.eventDate) || a.eventSlug.localeCompare(b.eventSlug),
    );
  if (fights.length === 0) return null;
  const total = fights.reduce((sum, fight) => sum + fight.stars, 0);
  return {
    name: fighter.name,
    country: fighter.country,
    slug: fighter.slug,
    average: Math.round((total / fights.length) * 100) / 100,
    styles: mapStyles(now.style),
    record: now.record == null ? null : toRecord(now.record),
    elo: toFighterElo(now.elo),
    stats: profileStats(fights) as ProfileStats,
    fights,
  };
}

/** Search results for the page: anyone with rated fights, whether or not they are ranked. */
export function toSearchResults(rows: readonly FighterRatingRow[]): FighterSearchResult[] {
  return rows.flatMap((row) => {
    const average = Number(row.avg_stars);
    if (!Number.isFinite(average) || !Number.isInteger(row.rated_fights) || row.rated_fights < 1) {
      return [];
    }
    return [
      { slug: row.slug, name: row.name, country: row.country, fights: row.rated_fights, average },
    ];
  });
}
