/** A starburst. Decorative: the label next to it says what it means. */
export function ClassicIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 1.5l2.4 5.3 5.2-2.3-1.6 5.5 5.5 1.6-5.3 2.4 2.3 5.2-5.5-1.6-1.6 5.5-2.4-5.3-5.2 2.3 1.6-5.5-5.5-1.6 5.3-2.4-2.3-5.2 5.5 1.6z" />
    </svg>
  );
}

/** The gold foil of a five-star fight. Only the classics get it. */
export const GOLD_FOIL = "linear-gradient(145deg, var(--gold-hi) 0%, var(--gold-mid) 45%, var(--gold-lo) 100%)";

/** The mark of a five-star fight: gold foil in an ink frame. */
export function ClassicBadge({ label = "Classic" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap border-2 border-[var(--text)] px-2 py-0.5 text-xs font-extrabold text-[var(--text)]"
      style={{ backgroundImage: GOLD_FOIL }}
    >
      <ClassicIcon />
      {label}
    </span>
  );
}
