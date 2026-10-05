import { ClassicIcon } from "./ClassicBadge";

const SIZE = {
  sm: { box: "h-[3.25rem] w-[3.25rem]", number: "text-[1.05rem]", stars: false },
  md: { box: "h-[4.25rem] w-[4.25rem]", number: "text-[1.45rem]", stars: false },
  lg: { box: "h-32 w-32 sm:h-36 sm:w-36", number: "text-[2.6rem] sm:text-5xl", stars: true },
} as const;

/** The octagon of a title-belt centre plate. */
const OCTAGON = "polygon(29% 0, 71% 0, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0 71%, 0 29%)";
/** Rays fanning out from the centre, like the engraving on a belt plate. */
const RAYS =
  "radial-gradient(circle at 50% 50%, rgb(255 244 200 / 0.75) 0%, rgb(255 244 200 / 0) 55%), repeating-conic-gradient(from 0deg at 50% 50%, #f8d36b 0deg 7.5deg, #e2a621 7.5deg 15deg)";

/**
 * The gold plate of a five-star fight, made like the centre of a title belt: a bright rim, a dark
 * channel, a face engraved with rays and the number in dark on it. Decorative: the rating is
 * always written out in words next to it.
 */
export function ClassicSeal({ value = "5.0", size = "md" }: { value?: string; size?: keyof typeof SIZE }) {
  const s = SIZE[size];
  return (
    <div aria-hidden="true" className={`relative shrink-0 drop-shadow-[0_8px_22px_rgb(242_181_42/0.35)] ${s.box}`}>
      <div
        className="gold-foil absolute inset-0"
        style={{ clipPath: OCTAGON }}
      />
      <div className="absolute inset-[5%] bg-[#1a1203]" style={{ clipPath: OCTAGON }} />
      <div className="absolute inset-[9%]" style={{ clipPath: OCTAGON, backgroundImage: RAYS }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`display text-[var(--ink)] tabular-nums [text-shadow:0_1px_0_rgb(255_240_184/0.7)] ${s.number}`}
        >
          {value}
        </span>
        {s.stars && (
          <span className="mt-1 flex gap-0.5 text-[var(--ink)]">
            {Array.from({ length: 5 }, (_, i) => (
              <ClassicIcon key={i} className="h-3 w-3" />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
