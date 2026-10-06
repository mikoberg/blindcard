import { HIGH_EXPECTATION, formatExpected } from "@/lib/upcoming/prediction";

/**
 * The expected rating, drawn so it can never be taken for a real one: a dashed outline instead of
 * a filled plate, a tilde in front, "expected" under it. Never gold, whatever the number.
 */
export function ExpectedPlate({ stars, size = "md" }: { stars: number; size?: "md" | "lg" }) {
  const hot = stars >= HIGH_EXPECTATION;
  const box = size === "lg" ? "h-14 w-[5.5rem] text-3xl" : "h-[3.25rem] w-[4.25rem] text-xl";
  return (
    <div
      className="shrink-0 text-center"
      role="img"
      aria-label={`Expected rating ${formatExpected(stars)} out of 5`}
    >
      <p
        aria-hidden="true"
        className={`scorebox border-dashed bg-transparent ${hot ? "border-[var(--accent)] text-[var(--accent)]" : "text-[var(--text)]"} ${box}`}
      >
        <span className="mr-0.5 text-[0.6em] font-semibold">~</span>
        {formatExpected(stars)}
      </p>
      <p aria-hidden="true" className="mt-1 text-xs text-[var(--muted)]">
        expected
      </p>
    </div>
  );
}

/**
 * The expected rating in the column of an announced bout, laid out like the rating column of a
 * played fight but never mistaken for one: a tilde in front of the number, "expected" under it, a
 * dashed divider, no stars and never gold.
 */
export function ExpectedMark({ stars }: { stars: number }) {
  const hot = stars >= HIGH_EXPECTATION;
  return (
    <div
      className="flex items-center gap-3 border-b border-dashed border-[var(--border)] px-4 py-2 sm:w-[5.5rem] sm:flex-col sm:justify-center sm:gap-1.5 sm:border-b-0 sm:border-r sm:px-0"
      role="img"
      aria-label={`Expected rating ${formatExpected(stars)} out of 5`}
    >
      <p
        aria-hidden="true"
        className={`display text-[1.7rem] leading-none tabular-nums sm:text-[1.9rem] ${hot ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
      >
        <span className="mr-px text-[0.5em] font-semibold">~</span>
        {formatExpected(stars)}
      </p>
      <p aria-hidden="true" className="text-xs font-semibold text-[var(--muted)]">
        expected
      </p>
    </div>
  );
}
