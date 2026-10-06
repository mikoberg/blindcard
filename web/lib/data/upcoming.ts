import { toFighterElo } from "@/lib/card/elo";
import { isValidSlug } from "@/lib/slug";
import { getSupabase } from "@/lib/supabase/server";
import type {
  BoutPrediction,
  PredictionReason,
  UpcomingBout,
  UpcomingEvent,
  UpcomingFighter,
  UpcomingSegment,
} from "@/lib/upcoming/types";
import { UPCOMING_BOUT_COLUMNS, UPCOMING_EVENT_COLUMNS } from "./columns";
import { ensure } from "./ensure";
import { fighterPageSlugs } from "./leaderboard";
import { mapStyles, toRecord } from "./map";

export { mapStyles };

interface EventRow {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  location: string | null;
  main_card_at: string | null;
  prelims_at: string | null;
  early_prelims_at: string | null;
}

interface FighterJoin {
  slug: string | null;
  country: string | null;
  style?: unknown;
}

interface BoutRow {
  id: string;
  event_id: string;
  card_position: number;
  segment: string | null;
  weight_class: string | null;
  is_title_fight: boolean;
  fighter_a_name: string;
  fighter_b_name: string;
  predicted_stars: number | string | null;
  prediction_basis: string | null;
  prediction_why: unknown;
  has_pick: boolean | null;
  fighter_a_record: unknown;
  fighter_a_elo?: unknown;
  fighter_b_elo?: unknown;
  fighter_b_record: unknown;
  fighter_a_style: unknown;
  fighter_b_style: unknown;
  fighter_a: FighterJoin | null;
  fighter_b: FighterJoin | null;
}

const SEGMENTS: readonly string[] = ["main", "prelim", "early_prelim"];

function fighter(
  name: string,
  joined: FighterJoin | null,
  record: unknown,
  styles: unknown,
  elo: unknown,
  pages: ReadonlySet<string>,
): UpcomingFighter {
  // Only a fighter with a profile page gets a link (a debutant has none).
  const slug = joined?.slug && isValidSlug(joined.slug) && pages.has(joined.slug) ? joined.slug : null;
  return {
    name,
    slug,
    country: joined?.country ?? null,
    record: record === null ? null : toRecord(record),
    elo: toFighterElo(elo),
    // the card's own link gives the style even for a debut; otherwise what is stored on the fighter
    styles: mapStyles(styles).length > 0 ? mapStyles(styles) : mapStyles(joined?.style),
  };
}

function reasons(value: unknown): PredictionReason[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    return typeof r.label === "string" && typeof r.amount === "number" && Number.isFinite(r.amount)
      ? [{ label: r.label, amount: r.amount }]
      : [];
  });
}

/** null unless the stored expectation is complete and inside the rating scale. */
export function mapPrediction(row: Pick<BoutRow, "predicted_stars" | "prediction_basis" | "prediction_why">): BoutPrediction | null {
  const stars = row.predicted_stars === null ? NaN : Number(row.predicted_stars);
  const basis = row.prediction_basis;
  if (!(stars >= 1 && stars <= 5)) return null;
  if (basis !== "both" && basis !== "one" && basis !== "none") return null;
  return { stars, basis, why: reasons(row.prediction_why) };
}

function bout(row: BoutRow, pages: ReadonlySet<string>): UpcomingBout {
  return {
    id: row.id,
    position: row.card_position,
    segment: row.segment !== null && SEGMENTS.includes(row.segment) ? (row.segment as UpcomingSegment) : null,
    weightClass: row.weight_class,
    isTitleFight: row.is_title_fight,
    a: fighter(row.fighter_a_name, row.fighter_a, row.fighter_a_record, row.fighter_a_style, row.fighter_a_elo, pages),
    b: fighter(row.fighter_b_name, row.fighter_b, row.fighter_b_record, row.fighter_b_style, row.fighter_b_elo, pages),
    prediction: mapPrediction(row),
    hasPick: row.has_pick === true,
  };
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Announced events that have not been fought yet (today included), soonest first, with their bouts. */
export async function listUpcomingEvents(now: Date = new Date()): Promise<UpcomingEvent[]> {
  const db = getSupabase();
  const events = ensure<EventRow[]>(
    await db
      .from("upcoming_events")
      .select(UPCOMING_EVENT_COLUMNS)
      .gte("event_date", todayIso(now))
      .order("event_date", { ascending: true })
      .order("id"),
    "list upcoming events",
  );
  if (events.length === 0) return [];
  const bouts = ensure<BoutRow[]>(
    await db
      .from("upcoming_bouts")
      .select(UPCOMING_BOUT_COLUMNS)
      .in(
        "event_id",
        events.map((e) => e.id),
      )
      .order("card_position", { ascending: true }),
    "list upcoming bouts",
  );
  const pages = await fighterPageSlugs(
    bouts.flatMap((row) => [row.fighter_a?.slug, row.fighter_b?.slug].filter((s): s is string => typeof s === "string")),
  );
  return events.map((event) => ({
    id: event.id,
    slug: event.slug,
    name: event.name,
    eventDate: event.event_date,
    location: event.location,
    mainCardAt: event.main_card_at,
    prelimsAt: event.prelims_at,
    earlyPrelimsAt: event.early_prelims_at,
    bouts: bouts.filter((row) => row.event_id === event.id).map((row) => bout(row, pages)),
  }));
}

export async function getUpcomingEvent(slug: string, now: Date = new Date()): Promise<UpcomingEvent | null> {
  if (!isValidSlug(slug)) return null;
  return (await listUpcomingEvents(now)).find((event) => event.slug === slug) ?? null;
}
