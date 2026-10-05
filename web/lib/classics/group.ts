import { isClassic } from "@/lib/card/classic";
import { isVideoId } from "@/lib/card/watch";
import { isValidSlug } from "@/lib/slug";
import type { ClassicFight, ClassicYear, FightRatingRow, FightVideoRow } from "./types";

/** The five-star fights among `rows`, newest first (ties by event, then fight id). */
export function toClassics(
  rows: readonly FightRatingRow[],
  videos: readonly FightVideoRow[] = [],
): ClassicFight[] {
  const videoByFight = new Map(
    videos.filter((v) => isVideoId(v.youtube_id)).map((v) => [v.fight_id, v.youtube_id]),
  );
  return rows
    .filter((row) => isClassic(Number(row.stars)) && isValidSlug(row.event_slug))
    .map((row) => ({
      id: row.fight_id,
      eventSlug: row.event_slug,
      eventName: row.event_name,
      eventDate: row.event_date,
      fighterA: row.fighter_a_name,
      fighterB: row.fighter_b_name,
      weightClass: row.weight_class,
      isTitleFight: row.is_title_fight,
      videoId: videoByFight.get(row.fight_id) ?? null,
    }))
    .sort(
      (a, b) =>
        b.eventDate.localeCompare(a.eventDate) ||
        a.eventSlug.localeCompare(b.eventSlug) ||
        a.id.localeCompare(b.id),
    );
}

export function classicsByYear(classics: readonly ClassicFight[]): ClassicYear[] {
  const years: ClassicYear[] = [];
  for (const fight of classics) {
    const year = fight.eventDate.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === year) last.fights.push(fight);
    else years.push({ year, fights: [fight] });
  }
  return years;
}
