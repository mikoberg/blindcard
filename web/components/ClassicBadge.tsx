/** A five-point star. Decorative: the label next to it says what it means. */
export function ClassicIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6 5.7 21.2l1.5-7.1L1.8 9.2l7.2-.8z" />
    </svg>
  );
}

/** The gold foil of a five-star fight. Only the classics get it. */
export const GOLD_FOIL = "linear-gradient(145deg, var(--gold-hi) 0%, var(--gold-mid) 45%, var(--gold-lo) 100%)";

/** A belt plate: pointed at both ends. */
const PLATE = "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)";
const PLATE_INNER = "polygon(9px 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 9px 100%, 0 50%)";

/**
 * The mark of a five-star fight: a small gold belt plate, a bright rim around a deeper gold face
 * with a star and the label engraved in dark. Only the classics get it.
 */
export function ClassicBadge({ label = "Classic" }: { label?: string }) {
  return (
    <span className="inline-flex drop-shadow-[0_3px_10px_rgb(242_181_42/0.3)]">
      <span
        className="inline-flex p-[1.5px]"
        style={{ clipPath: PLATE, backgroundImage: GOLD_FOIL }}
      >
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap py-[3px] pl-3 pr-3.5 text-xs font-extrabold tracking-[0.01em] text-[var(--ink)]"
          style={{
            clipPath: PLATE_INNER,
            backgroundImage: "linear-gradient(180deg, #f9cf5a 0%, #e0a21b 55%, #c58b0c 100%)",
          }}
        >
          <ClassicIcon className="h-3 w-3" />
          {label}
        </span>
      </span>
    </span>
  );
}
