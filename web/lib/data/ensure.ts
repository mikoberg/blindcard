/** A database or integrity failure. The message carries a short code, never database text. */
export class DataError extends Error {
  constructor(what: string, code?: string | null) {
    super(`${what} failed${code ? ` (${code})` : ""}`);
    this.name = "DataError";
  }
}

interface Result {
  data: unknown;
  error: { code?: string | null } | null;
}

export function ensure<T>(result: Result, what: string): T {
  if (result.error) throw new DataError(what, result.error.code ?? null);
  if (result.data === null || result.data === undefined) throw new DataError(what, "no_data");
  return result.data as T;
}

export function ensureOptional<T>(result: Result, what: string): T | null {
  if (result.error) throw new DataError(what, result.error.code ?? null);
  return (result.data ?? null) as T | null;
}
