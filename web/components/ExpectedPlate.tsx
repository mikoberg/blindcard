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
