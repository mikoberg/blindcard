import { isValidSlug } from "@/lib/slug";

/**
 * One scorecard that went against the official result of a fight, with that fight named. This is
 * result data: it is only loaded after an explicit click on a judge page, through the reveal path
 * (`judge_disputed_cards`), never during a page render.
 */
export interface DisputedCard {
  fightId: string;
  eventName: string;
  eventSlug: string;
  eventDate: string;
  fighterA: { name: string; slug: string };
  fighterB: { name: string; slug: string };
  /** The fighter the official result went to. */
  winnerName: string;
  method: string;
  /** All three scorecards as written, e.g. "Ron McCarthy 29 - 28". */
  scorecards: string[];
  /** The judge's own card, name cleaned. */
  judgeCard: string;
  /** Points between the fighters on the judge's card; negative = the other fighter was ahead. */
  margin: number;
  /** Both other judges agreed with the official result. */
  lone: boolean;
}

/** A row of `judge_disputed_cards`. */
export interface DisputeRow {
  fight_id: unknown;
  event_name: unknown;
  event_slug: unknown;
  event_date: unknown;
  fighter_a_name: unknown;
  fighter_a_slug: unknown;
  fighter_b_name: unknown;
  fighter_b_slug: unknown;
  winner_name: unknown;
  method: unknown;
  scorecards: unknown;
  judge_card: unknown;
  margin: unknown;
  lone: unknown;
}

export class DisputeParseError extends Error {
  constructor(reason: string) {
    super(`invalid disputed scorecards: ${reason}`);
    this.name = "DisputeParseError";
  }
}

export class DisputeRequestError extends Error {
  constructor(readonly status: number) {
    super(`disputed scorecards request failed with status ${status}`);
    this.name = "DisputeRequestError";
  }
}

/** At most this many cards are ever served for one judge (also enforced in the database). */
export const MAX_DISPUTES = 10;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new DisputeParseError(label);
  return value;
}

function slug(value: unknown, label: string): string {
  const s = text(value, label);
  if (!isValidSlug(s)) throw new DisputeParseError(label);
  return s;
}

function card(o: Record<string, unknown>): DisputedCard {
  const scorecards = o.scorecards;
  if (!Array.isArray(scorecards) || !scorecards.every((s) => typeof s === "string")) {
    throw new DisputeParseError("scorecards");
  }
  if (typeof o.margin !== "number" || !Number.isInteger(o.margin) || o.margin >= 0) {
    throw new DisputeParseError("margin");
  }
  if (typeof o.lone !== "boolean") throw new DisputeParseError("lone");
  return {
    fightId: text(o.fightId, "fight id"),
    eventName: text(o.eventName, "event name"),
    eventSlug: slug(o.eventSlug, "event slug"),
    eventDate: text(o.eventDate, "event date"),
    fighterA: {
      name: text((o.fighterA as Record<string, unknown> | undefined)?.name, "fighter a"),
      slug: slug((o.fighterA as Record<string, unknown> | undefined)?.slug, "fighter a slug"),
    },
    fighterB: {
      name: text((o.fighterB as Record<string, unknown> | undefined)?.name, "fighter b"),
      slug: slug((o.fighterB as Record<string, unknown> | undefined)?.slug, "fighter b slug"),
    },
    winnerName: text(o.winnerName, "official result"),
    method: text(o.method, "method"),
    scorecards: scorecards as string[],
    judgeCard: text(o.judgeCard, "judge card"),
    margin: o.margin,
    lone: o.lone,
  };
}

/** Maps database rows to cards; anything unexpected is an error, never a guess. */
export function rowsToCards(rows: readonly DisputeRow[]): DisputedCard[] {
  if (rows.length > MAX_DISPUTES) throw new DisputeParseError("too many rows");
  return rows.map((r) =>
    card({
      fightId: r.fight_id,
      eventName: r.event_name,
      eventSlug: r.event_slug,
      eventDate: r.event_date,
      fighterA: { name: r.fighter_a_name, slug: r.fighter_a_slug },
      fighterB: { name: r.fighter_b_name, slug: r.fighter_b_slug },
      winnerName: r.winner_name,
      method: r.method,
      scorecards: r.scorecards,
      judgeCard: r.judge_card,
      margin: r.margin,
      lone: r.lone,
    }),
  );
}

/** Validates what the browser received. Error bodies and odd shapes are rejected. */
export function parseDisputes(json: unknown): DisputedCard[] {
  if (typeof json !== "object" || json === null) throw new DisputeParseError("not an object");
  const cards = (json as Record<string, unknown>).cards;
  if (!Array.isArray(cards)) throw new DisputeParseError("cards");
  if (cards.length > MAX_DISPUTES) throw new DisputeParseError("too many cards");
  return cards.map((item) => {
    if (typeof item !== "object" || item === null) throw new DisputeParseError("card");
    return card(item as Record<string, unknown>);
  });
}

/** Browser side: ask for one judge's most disputed scorecards. Never cached. */
export async function fetchDisputes(
  judgeSlug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DisputedCard[]> {
  const response = await fetchImpl(`/api/judges/${encodeURIComponent(judgeSlug)}/disputes`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new DisputeRequestError(response.status);
  return parseDisputes(await response.json());
}

/** "Decision - Split" -> "split decision". Anything else is shown as it is. */
export function describeMethod(method: string): string {
  const match = /^Decision\s*-\s*(.+)$/i.exec(method.trim());
  return match?.[1] ? `${match[1].toLowerCase()} decision` : method;
}

/** The fighter the judge had ahead: the one the official result did not go to. */
export function otherFighter(card: DisputedCard): string {
  return card.winnerName === card.fighterA.name ? card.fighterB.name : card.fighterA.name;
}
