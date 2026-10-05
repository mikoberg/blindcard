import { isValidSlug } from "@/lib/slug";

/**
 * One fight in a fighter's Elo history with every number of the calculation. It names fights and how
 * they were decided, so it is result data: it is only loaded after an explicit click on a fighter of
 * the spoiler page, through the reveal path (`elo_fighter_history`), never during a page render.
 */
export interface EloStepView {
  /** This fighter's n-th fight on the board. */
  seq: number;
  date: string;
  eventName: string;
  opponent: string;
  opponentSlug: string | null;
  /** What the fight counted as for this fighter: 1, 0, 0.5 for a draw, or a partial credit. */
  score: number;
  /** For example "won by split decision". */
  how: string;
  ratingBefore: number;
  opponentRating: number;
  expected: number;
  k: number;
  change: number;
  ratingAfter: number;
}

/** A row of `elo_fighter_history`. */
export interface EloStepRow {
  seq: unknown;
  fight_date: unknown;
  event_name: unknown;
  opponent_name: unknown;
  opponent_slug: unknown;
  score: unknown;
  how: unknown;
  rating_before: unknown;
  opponent_rating: unknown;
  expected: unknown;
  k: unknown;
  change: unknown;
  rating_after: unknown;
}

/** At most this many fights are ever served for one fighter (also enforced in the database). */
export const MAX_ELO_STEPS = 120;

export class EloHistoryParseError extends Error {
  constructor(reason: string) {
    super(`invalid Elo history: ${reason}`);
    this.name = "EloHistoryParseError";
  }
}

export class EloHistoryRequestError extends Error {
  constructor(readonly status: number) {
    super(`Elo history request failed with status ${status}`);
    this.name = "EloHistoryRequestError";
  }
}

function num(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new EloHistoryParseError(label);
  return n;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new EloHistoryParseError(label);
  return value;
}

/** Maps one database row; anything unexpected is an error, never a guess. */
export function rowToStep(row: EloStepRow): EloStepView {
  const seq = num(row.seq, "seq");
  const score = num(row.score, "score");
  const expected = num(row.expected, "expected");
  if (!Number.isInteger(seq) || seq < 1) throw new EloHistoryParseError("seq");
  if (score < 0 || score > 1) throw new EloHistoryParseError("score");
  if (expected < 0 || expected > 1) throw new EloHistoryParseError("expected");
  const date = text(row.fight_date, "fight_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new EloHistoryParseError("fight_date");
  return {
    seq,
    date,
    eventName: text(row.event_name, "event_name"),
    opponent: text(row.opponent_name, "opponent_name"),
    opponentSlug: typeof row.opponent_slug === "string" && isValidSlug(row.opponent_slug) ? row.opponent_slug : null,
    score,
    how: text(row.how, "how"),
    ratingBefore: num(row.rating_before, "rating_before"),
    opponentRating: num(row.opponent_rating, "opponent_rating"),
    expected,
    k: num(row.k, "k"),
    change: num(row.change, "change"),
    ratingAfter: num(row.rating_after, "rating_after"),
  };
}

export function rowsToSteps(rows: readonly EloStepRow[]): EloStepView[] {
  if (rows.length > MAX_ELO_STEPS) throw new EloHistoryParseError("too many rows");
  return rows.map(rowToStep);
}

/** Validates what the browser received: the steps the route sends. Error bodies are rejected. */
export function parseHistory(json: unknown): EloStepView[] {
  if (typeof json !== "object" || json === null) throw new EloHistoryParseError("not an object");
  const steps = (json as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) throw new EloHistoryParseError("steps");
  return rowsToSteps(
    steps.map((item) => {
      const s = (item ?? {}) as Record<string, unknown>;
      return {
        seq: s.seq,
        fight_date: s.date,
        event_name: s.eventName,
        opponent_name: s.opponent,
        opponent_slug: s.opponentSlug,
        score: s.score,
        how: s.how,
        rating_before: s.ratingBefore,
        opponent_rating: s.opponentRating,
        expected: s.expected,
        k: s.k,
        change: s.change,
        rating_after: s.ratingAfter,
      } as EloStepRow;
    }),
  );
}

/** Browser side: ask for one fighter's history. Never cached. */
export async function fetchEloHistory(slug: string, fetchImpl: typeof fetch = fetch): Promise<EloStepView[]> {
  const response = await fetchImpl(`/api/elo/${encodeURIComponent(slug)}`, { method: "POST", cache: "no-store" });
  if (!response.ok) throw new EloHistoryRequestError(response.status);
  return parseHistory(await response.json());
}
