import type { CardFight } from "@/lib/card/types";
import { getSupabase } from "@/lib/supabase/server";
import {
  FIGHTER_COLUMNS,
  FIGHT_COLUMNS,
  FIGHT_VIDEO_COLUMNS,
  SCORE_COLUMNS,
  VERSION_COLUMNS,
} from "./columns";
import { ensure, ensureOptional } from "./ensure";
import { buildCard, type FightRow, type FighterRow, type ScoreRow, type VideoRow } from "./map";

/** The card of one event: fights, fighters and the active score version's ratings. */
export async function getCard(eventId: string): Promise<CardFight[]> {
  const db = getSupabase();

  const fights = ensure<FightRow[]>(
    await db.from("fights").select(FIGHT_COLUMNS).eq("event_id", eventId).order("card_position"),
    "load fights",
  );
  if (fights.length === 0) return [];

  const fighterIds = [...new Set(fights.flatMap((fight) => [fight.fighter_a_id, fight.fighter_b_id]))];
  const fighters = ensure<FighterRow[]>(
    await db.from("fighters").select(FIGHTER_COLUMNS).in("id", fighterIds),
    "load fighters",
  );

  const version = ensureOptional<{ version: number }>(
    await db.from("scoring_versions").select(VERSION_COLUMNS).eq("is_active", true).maybeSingle(),
    "load active version",
  );
  const scores = version
    ? ensure<ScoreRow[]>(
        await db
          .from("excitement_scores")
          .select(SCORE_COLUMNS)
          .eq("version", version.version)
          .in("fight_id", fights.map((fight) => fight.id)),
        "load scores",
      )
    : [];

  const videos = ensure<VideoRow[]>(
    await db
      .from("fight_videos")
      .select(FIGHT_VIDEO_COLUMNS)
      .in(
        "fight_id",
        fights.map((fight) => fight.id),
      ),
    "load fight videos",
  );

  return buildCard(fights, fighters, scores, videos);
}
