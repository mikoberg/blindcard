/** A starburst. Decorative: the label next to it says what it means. */
export function ClassicIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 1.5l2.4 5.3 5.2-2.3-1.6 5.5 5.5 1.6-5.3 2.4 2.3 5.2-5.5-1.6-1.6 5.5-2.4-5.3-5.2 2.3 1.6-5.5-5.5-1.6 5.3-2.4-2.3-5.2 5.5 1.6z" />
    </svg>
  );
}

/** The mark of a five-star fight: only the classics get it. */
export function ClassicBadge({ label = "Classic" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold text-[var(--accent-ink)] shadow-[0_0_0_1px_#ffe9a6,0_0_14px_rgb(255_176_32/0.5)]"
      style={{ backgroundImage: "linear-gradient(145deg, #fff0b8 0%, #ffc233 45%, #d98a00 100%)" }}>
      <ClassicIcon />
      {label}
    </span>
  );
}
