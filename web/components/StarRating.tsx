import { formatStars, starFills, starsLabel, type StarFill } from "@/lib/card/stars";

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

function Star({ fill }: { fill: StarFill }) {
  return (
    <span className="relative inline-block h-5 w-5">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-5 w-5 fill-[var(--border)]">
        <path d={STAR_PATH} />
      </svg>
      {fill !== "empty" && (
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 h-5 w-5 fill-[var(--accent)]"
          style={fill === "half" ? { clipPath: "inset(0 50% 0 0)" } : undefined}
        >
          <path d={STAR_PATH} />
        </svg>
      )}
    </span>
  );
}

export function StarRating({ stars }: { stars: number | null }) {
  if (stars === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
        Not rated yet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={starsLabel(stars)}>
      <span className="flex gap-0.5" aria-hidden="true">
        {starFills(stars).map((fill, index) => (
          <Star key={index} fill={fill} />
        ))}
      </span>
      <span
        className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
        aria-hidden="true"
      >
        {formatStars(stars)}
      </span>
    </span>
  );
}
