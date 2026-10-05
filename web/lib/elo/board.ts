import { isValidSlug } from "@/lib/slug";

/**
 * One fighter on the Elo leaderboard. An Elo rating is built from who beat whom, so this is result
 * data: it is only loaded after an explicit click on the spoiler page, through the reveal path
 * (`elo_leaderboard`), never during a page render.
 */
export interface EloEntry {
  rank: number;
  name: string;
  /** The fighter's page, when they have one. */
  slug: string | null;
  country: string | null;
  rating: number;
  fights: number;
  /** ISO date of their latest fight. */
  lastFight: string;
}

/** A row of `elo_leaderboard`. */
export interface EloRow {
  rank: unknown;
  name: unknown;
  slug: unknown;
  country: unknown;
  rating: unknown;
  fights: unknown;
  last_fight: unknown;
}

/** At most this many rows are ever served (also enforced in the database). */
export const MAX_ELO_ROWS = 100;
/** How many the page asks for. */
export const ELO_ROWS_SHOWN = 50;

export class EloParseError extends Error {
  constructor(reason: string) {
    super(`invalid Elo board: ${reason}`);
    this.name = "EloParseError";
  }
}

export class EloRequestError extends Error {
  constructor(readonly status: number) {
    super(`Elo board request failed with status ${status}`);
    this.name = "EloRequestError";
  }
}

function number(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new EloParseError(label);
  return n;
}

/** Maps one database row; anything unexpected is an error, never a guess. */
export function rowToEntry(row: EloRow): EloEntry {
  const rank = number(row.rank, "rank");
  const fights = number(row.fights, "fights");
  if (!Number.isInteger(rank) || rank < 1) throw new EloParseError("rank");
  if (!Number.isInteger(fights) || fights < 1) throw new EloParseError("fights");
  if (typeof row.name !== "string" || row.name.length === 0) throw new EloParseError("name");
  if (typeof row.last_fight !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.last_fight)) {
    throw new EloParseError("last_fight");
  }
  return {
    rank,
    name: row.name,
    slug: typeof row.slug === "string" && isValidSlug(row.slug) ? row.slug : null,
    country: typeof row.country === "string" ? row.country : null,
    rating: number(row.rating, "rating"),
    fights,
    lastFight: row.last_fight,
  };
}

export function rowsToEntries(rows: readonly EloRow[]): EloEntry[] {
  if (rows.length > MAX_ELO_ROWS) throw new EloParseError("too many rows");
  return rows.map(rowToEntry);
}

/**
 * Validates what the browser received: the entries the route sends (already in the shape of
 * `EloEntry`, not database rows). Error bodies and odd shapes are rejected.
 */
export function parseBoard(json: unknown): EloEntry[] {
  if (typeof json !== "object" || json === null) throw new EloParseError("not an object");
  const board = (json as Record<string, unknown>).board;
  if (!Array.isArray(board)) throw new EloParseError("board");
  // The same checks as for a database row, so what the browser accepts is what the server could send.
  return rowsToEntries(
    board.map((item) => {
      const e = (item ?? {}) as Record<string, unknown>;
      return { ...e, last_fight: e.lastFight } as EloRow;
    }),
  );
}

/** Browser side: ask for the board. Never cached. */
export async function fetchEloBoard(fetchImpl: typeof fetch = fetch): Promise<EloEntry[]> {
  const response = await fetchImpl("/api/elo", { method: "POST", cache: "no-store" });
  if (!response.ok) throw new EloRequestError(response.status);
  return parseBoard(await response.json());
}
