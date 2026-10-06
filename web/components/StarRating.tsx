import { formatStars, starFills, starsLabel, type StarFill } from "@/lib/card/stars";

const STAR_PATH = "M12 2.2l2.95 6.2 6.75.85-4.95 4.7 1.25 6.7L12 17.3l-6 3.35 1.25-6.7L2.3 9.25l6.75-.85z";

/**
 * The gold gradient every star refers to, once per page (an id may appear only once in a document).
 * Rendered in the root layout. Not `display: none`: browsers then ignore the gradient.
 */
export function StarDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="pointer-events-none absolute">
      <defs>
        <linearGradient id="star-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold-hi)" />
          <stop offset="50%" stopColor="var(--gold-mid)" />
          <stop offset="100%" stopColor="var(--gold-lo)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** One of the five stars: gold when earned, an empty contour when not, half gold for a half. */
function Star({ fill, onDark, small }: { fill: StarFill; onDark: boolean; small: boolean }) {
  const box = small ? "h-4 w-4" : "h-6 w-6";
  return (
    <span className={`relative inline-block ${box}`}>
      <svg viewBox="0 0 24 24" className={`absolute inset-0 ${box}`} fill="none">
        <path d={STAR_PATH} stroke={onDark ? "var(--bg)" : "var(--text)"} strokeOpacity={onDark ? "0.55" : "0.3"} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {fill !== "empty" && (
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 ${box}`}
          style={fill === "half" ? { clipPath: "inset(0 50% 0 0)" } : undefined}
        >
          <path
            d={STAR_PATH}
            fill="url(#star-gold)"
            stroke="var(--gold-lo)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/** The five stars as flat marks: gold when earned, grey when not, half gold for a half. For the card. */
function FlatStars({ stars, showNumber }: { stars: number; showNumber: boolean }) {
  const mask = "polygon(50% 0, 62% 36%, 100% 38%, 70% 60%, 80% 98%, 50% 76%, 20% 98%, 30% 60%, 0 38%, 38% 36%)";
  const paint: Record<StarFill, string> = {
    full: "var(--gold-mid)",
    half: "linear-gradient(90deg, var(--gold-mid) 50%, var(--border) 50%)",
    empty: "var(--border)",
  };
  return (
    <span className="inline-flex items-center gap-3" role="img" aria-label={starsLabel(stars)}>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {starFills(stars).map((fill, index) => (
          <i key={index} className="block h-[11px] w-[11px]" style={{ clipPath: mask, background: paint[fill] }} />
        ))}
      </span>
      {showNumber && (
        <span
          aria-hidden="true"
          className={`display text-xl leading-none tabular-nums ${stars >= 4 ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
        >
          {formatStars(stars)}
        </span>
      )}
    </span>
  );
}

export function StarRating({
  stars,
  showNumber = true,
  onDark = false,
  small = false,
  flat = false,
}: {
  /** Flat, small stars without outline, as on the fight card. With the number when `showNumber` is set. */
  flat?: boolean;
  /** Smaller stars, for dense places such as the fight card. */
  small?: boolean;
  stars: number | null;
  /** Empty stars are drawn light, for use on an ink or red background. */
  onDark?: boolean;
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
  if (flat) return <FlatStars stars={stars} showNumber={showNumber} />;
  return (
    <span className="inline-flex items-center gap-2.5" role="img" aria-label={starsLabel(stars)}>
      <span className={`flex ${small ? "gap-px" : "gap-0.5"}`} aria-hidden="true">
        {starFills(stars).map((fill, index) => (
          <Star key={index} fill={fill} onDark={onDark} small={small} />
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
