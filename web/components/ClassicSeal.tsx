import { ClassicIcon, GOLD_FOIL } from "./ClassicBadge";

const SIZE = {
  md: { box: "h-16 w-16 text-3xl", burst: "h-14 w-14" },
  lg: { box: "h-28 w-28 text-5xl", burst: "h-24 w-24" },
} as const;

/**
 * The gold-foil plate of a five-star fight: the number in ink on a starburst, set in an ink
 * frame with a hard shadow, like a stamped medal. Decorative: the rating is always written out
 * in words next to it.
 */
export function ClassicSeal({ value = "5.0", size = "md" }: { value?: string; size?: keyof typeof SIZE }) {
  const s = SIZE[size];
  return (
    <div
      aria-hidden="true"
      className={`scorebox relative shrink-0 overflow-hidden shadow-[3px_3px_0_var(--text)] ${s.box}`}
      style={{ backgroundImage: GOLD_FOIL }}
    >
      <ClassicIcon className={`absolute text-white/45 ${s.burst}`} />
      <span className="relative">{value}</span>
    </div>
  );
}
