/**
 * Who is favoured in an upcoming bout. Learned from past results, so it is private: it is only
 * loaded after an explicit click on one bout, through a POST route, and never during a render.
 */
export interface UpcomingPick {
  /** The fighter listed first ("a") or second ("b") on the bout. */
  favoured: "a" | "b";
  /** Chance of the favoured side, between 0.5 and 1. */
  probability: number;
  basis: "both" | "one";
  /** How often this kind of pick was right on past fights. */
  accuracy: number;
}

export interface PickRow {
  favoured: unknown;
  probability: unknown;
  basis: unknown;
  accuracy: unknown;
}

export class PickParseError extends Error {
  constructor(reason: string) {
    super(`invalid pick: ${reason}`);
    this.name = "PickParseError";
  }
}

export class PickRequestError extends Error {
  constructor(readonly status: number) {
    super(`pick request failed with status ${status}`);
    this.name = "PickRequestError";
  }
}

function between(value: unknown, low: number, high: number, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < low || n > high) throw new PickParseError(label);
  return n;
}

/** Maps a database row; anything unexpected is an error, never a guess. */
export function rowToPick(row: PickRow): UpcomingPick {
  if (row.favoured !== "a" && row.favoured !== "b") throw new PickParseError("side");
  if (row.basis !== "both" && row.basis !== "one") throw new PickParseError("basis");
  return {
    favoured: row.favoured,
    probability: between(row.probability, 0.5, 1, "probability"),
    basis: row.basis,
    accuracy: between(row.accuracy, 0, 1, "accuracy"),
  };
}

/** Validates what the browser received. Error bodies and odd shapes are rejected. */
export function parsePick(json: unknown): UpcomingPick {
  if (typeof json !== "object" || json === null) throw new PickParseError("not an object");
  const o = (json as Record<string, unknown>).pick;
  if (typeof o !== "object" || o === null) throw new PickParseError("pick");
  return rowToPick(o as PickRow);
}

/** Browser side: ask for the favourite of one bout. Never cached. */
export async function fetchPick(boutId: string, fetchImpl: typeof fetch = fetch): Promise<UpcomingPick> {
  const response = await fetchImpl(`/api/upcoming/${encodeURIComponent(boutId)}/pick`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new PickRequestError(response.status);
  return parsePick(await response.json());
}

/** Under this, the sides are too close to name a favourite with a straight face. */
export const TOSS_UP_BELOW = 0.55;

export function isTossUp(pick: UpcomingPick): boolean {
  // Judged on the percentage the visitor sees, so 55% on screen is never called a toss-up.
  return Math.round(pick.probability * 100) < TOSS_UP_BELOW * 100;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
