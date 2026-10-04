import { isValidStars } from "@/lib/card/stars";
import type { CardEvent, CardFight, CardSegment, FightCareer, FighterCareer, Rating } from "@/lib/card/types";
import type { EventSummary, MainEvent, RatedSlot } from "@/lib/overview/types";
import { DataError } from "./ensure";

export interface EventRow {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  location: string | null;
}

export interface FightRow {
  id: string;
  event_id: string;
  card_position: number;
  card_segment: string | null;
  career: unknown;
  weight_class: string | null;
  is_title_fight: boolean;
  scheduled_rounds: number | null;
  fighter_a_id: string;
  fighter_b_id: string;
}

export interface FighterRow {
  id: string;
  name: string;
}

/** `stars` and `percentile` are numeric columns; accept numbers or numeric strings. */
export interface ScoreRow {
  fight_id: string;
  stars: number | string | null;
  percentile: number | string | null;
}

export function mapEvent(row: EventRow): CardEvent {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    eventDate: row.event_date,
    location: row.location,
  };
}

function toNumber(value: number | string | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/** A rating is valid only if both numbers are valid. Never guess; invalid means unrated. */
function toRating(score: ScoreRow | undefined): Rating | null {
  if (!score) return null;
  const stars = toNumber(score.stars);
  const percentile = toNumber(score.percentile);
  if (!isValidStars(stars) || !Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    // Log the fight id only: never a score value and never anything from a result.
    console.warn(`invalid score for fight ${score.fight_id}; showing it as not rated`);
    return null;
  }
  return { stars, percentile };
}

function toFighterCareer(value: unknown): FighterCareer | null {
  const o = (value ?? {}) as { streak?: unknown; unbeaten?: unknown };
  if (typeof o.streak !== "number" || !Number.isInteger(o.streak) || o.streak < 0) return null;
  if (typeof o.unbeaten !== "boolean") return null;
  return { streak: o.streak, unbeaten: o.unbeaten };
}

/** Anything that does not have the expected shape is treated as "no context", never guessed. */
function toCareer(value: unknown): FightCareer | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as { meetings?: unknown; a?: unknown; b?: unknown };
  const a = toFighterCareer(o.a);
  const b = toFighterCareer(o.b);
  if (typeof o.meetings !== "number" || !Number.isInteger(o.meetings) || o.meetings < 0) return null;
  if (a === null || b === null) return null;
  return { meetings: o.meetings, a, b };
}

const SEGMENTS: readonly CardSegment[] = ["main", "prelim", "early_prelim"];

/** An unknown value is treated as "no segment", never guessed. */
function toSegment(fight: FightRow): CardSegment | null {
  if (fight.card_segment === null || fight.card_segment === undefined) return null;
  if ((SEGMENTS as readonly string[]).includes(fight.card_segment)) return fight.card_segment as CardSegment;
  console.warn(`unknown card segment for fight ${fight.id}; shown without a segment`);
  return null;
}

export function buildCard(
  fights: readonly FightRow[],
  fighters: readonly FighterRow[],
  scores: readonly ScoreRow[],
): CardFight[] {
  const fighterById = new Map(fighters.map((row) => [row.id, { id: row.id, name: row.name }]));
  const scoreByFight = new Map<string, ScoreRow>();
  for (const score of scores) {
    if (!scoreByFight.has(score.fight_id)) scoreByFight.set(score.fight_id, score);
  }

  return fights
    .map((fight): CardFight => {
      const fighterA = fighterById.get(fight.fighter_a_id);
      const fighterB = fighterById.get(fight.fighter_b_id);
      if (!fighterA || !fighterB) throw new DataError("build card", "missing_fighter");
      return {
        id: fight.id,
        cardPosition: fight.card_position,
        cardSegment: toSegment(fight),
        career: toCareer(fight.career),
        weightClass: fight.weight_class,
        isTitleFight: fight.is_title_fight,
        scheduledRounds: fight.scheduled_rounds,
        fighterA,
        fighterB,
        rating: toRating(scoreByFight.get(fight.id)),
      };
    })
    .sort((a, b) => a.cardPosition - b.cardPosition);
}

export interface OverviewRow {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  location: string | null;
  /** jsonb array of { p: card position, s: stars } in card order. */
  ratings: unknown;
  main_event_a: string | null;
  main_event_b: string | null;
  main_event_title: boolean | null;
}

/** Keeps only well-formed slots; returns how many were dropped so the caller can log once. */
function toSlots(value: unknown): { slots: RatedSlot[]; dropped: number } {
  if (!Array.isArray(value)) return { slots: [], dropped: 0 };
  const slots: RatedSlot[] = [];
  let dropped = 0;
  for (const item of value) {
    const slot = (item ?? {}) as { p?: unknown; s?: unknown };
    const stars = toNumber(slot.s as number | string | null);
    if (typeof slot.p === "number" && Number.isInteger(slot.p) && slot.p >= 1 && isValidStars(stars)) {
      slots.push({ position: slot.p, stars });
    } else {
      dropped += 1;
    }
  }
  return { slots: slots.sort((a, b) => a.position - b.position), dropped };
}

function toMainEvent(row: OverviewRow): MainEvent | null {
  const { main_event_a: a, main_event_b: b } = row;
  if (typeof a !== "string" || a.trim() === "" || typeof b !== "string" || b.trim() === "") return null;
  return { a, b, title: row.main_event_title === true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps one overview row. A row that cannot be shown (no usable date or name) is skipped, and
 * a malformed rating slot is dropped (shown as not rated), never guessed. The log names the
 * event id only, once per event.
 */
export function mapOverview(row: OverviewRow): EventSummary | null {
  if (!ISO_DATE.test(row.event_date) || typeof row.name !== "string" || row.name === "") {
    console.warn(`unusable overview row for event ${row.id}; skipped`);
    return null;
  }
  const { slots, dropped } = toSlots(row.ratings);
  if (dropped > 0) console.warn(`${dropped} invalid rating slot(s) in event ${row.id}; shown as not rated`);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.event_date,
    location: row.location,
    mainEvent: toMainEvent(row),
    ratings: slots,
  };
}
