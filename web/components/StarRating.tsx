import { formatStars, starFills, starsLabel, type StarFill } from "@/lib/card/stars";

/** One box of the five a scorecard row has: empty, half (left half inked) or full. */
function Box({ fill }: { fill: StarFill }) {
  return (
    <span className="relative inline-block h-[1.1rem] w-[1.1rem] overflow-hidden border-2 border-[var(--text)] bg-[var(--surface)]">
      {fill !== "empty" && (
        <span
          className="absolute inset-y-0 left-0 bg-[var(--text)]"
          style={{ width: fill === "half" ? "50%" : "100%" }}
        />
      )}
    </span>
  );
}

export function StarRating({
  stars,
  showNumber = true,
}: {
  stars: number | null;
  /** Hide the number when it is shown elsewhere (the rating plate); the label stays. */
  showNumber?: boolean;
}) {
  if (stars === null) {
    return (
      <span className="inline-flex items-center border-2 border-dashed border-[var(--muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
        Not rated yet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5" role="img" aria-label={starsLabel(stars)}>
      <span className="flex gap-1" aria-hidden="true">
        {starFills(stars).map((fill, index) => (
          <Box key={index} fill={fill} />
        ))}
      </span>
      {showNumber && (
        <span className="display-tight text-xl tabular-nums" aria-hidden="true">
          {formatStars(stars)}
        </span>
      )}
    </span>
  );
}
