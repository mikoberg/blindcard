import { ClassicIcon } from "./ClassicBadge";

const SIZE = {
  md: { box: "h-[4.5rem] w-16 rounded-lg text-4xl", burst: "h-14 w-14" },
  lg: { box: "h-28 w-24 rounded-xl text-6xl", burst: "h-24 w-24" },
} as const;

/**
 * The gold-foil seal of a five-star fight: the number on an embossed starburst, like a medal.
 * Decorative: the rating is always written out in words next to it.
 */
export function ClassicSeal({ value = "5.0", size = "md" }: { value?: string; size?: keyof typeof SIZE }) {
  const s = SIZE[size];
  return (
    <div
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-[family-name:var(--font-display)] font-bold tabular-nums text-[var(--accent-ink)] shadow-[0_0_0_1px_#ffe9a6,0_6px_22px_rgb(255_176_32/0.45)] ${s.box}`}
      style={{ backgroundImage: "linear-gradient(145deg, #fff0b8 0%, #ffc233 42%, #d98a00 100%)" }}
    >
      <ClassicIcon className={`absolute text-white/35 ${s.burst}`} />
      <span className="relative">{value}</span>
    </div>
  );
}
