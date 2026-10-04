export class RevealParseError extends Error {
  constructor(reason: string) {
    super(`invalid reveal response: ${reason}`);
    this.name = "RevealParseError";
  }
}

export class RevealFormatError extends Error {
  constructor(reason: string) {
    super(`cannot format reveal: ${reason}`);
    this.name = "RevealFormatError";
  }
}

export class RevealRequestError extends Error {
  constructor(readonly status: number) {
    super(`reveal request failed with status ${status}`);
    this.name = "RevealRequestError";
  }
}

/** The database could not answer. Carries only a short code, never row data. */
export class RevealUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`reveal unavailable (${code})`);
    this.name = "RevealUnavailableError";
  }
}
