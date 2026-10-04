import { barHeight, posterArt } from "@/lib/overview/poster";
import { stripLabel } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";

type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, string> = {
  sm: "h-24",
  md: "h-36",
  lg: "min-h-60",
};

/** Strip share of the poster's height: the tallest bar (5 stars) reaches this far up. */
const STRIP_HEIGHT: Record<Size, string> = {
  sm: "h-[62%]",
  md: "h-[58%]",
  lg: "h-24",
};

/**
 * A poster for one event: generated colour art plus the rating strip, one bar per rated fight
 * in card order, taller for a higher rating. Built from the event name and star ratings only.
 * `children` is laid over the art (the event page puts its title there).
 */
export function EventPoster({
  event,
  size,
  animate = false,
  decorative = false,
  children,
}: {
  event: EventSummary;
  size: Size;
  animate?: boolean;
  /** Hide the strip from assistive tech (the surrounding card already says it in words). */
  decorative?: boolean;
  children?: React.ReactNode;
}) {
  const art = posterArt(event.name);
  return (
    <div
      className={`relative isolate overflow-hidden ${HEIGHT[size]}`}
      style={{ backgroundColor: art.ground }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ backgroundColor: art.slab, clipPath: art.cut }}
      />
      <div aria-hidden="true" className="poster-stripes absolute inset-0 -z-10" />
      {children}
      <div
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : stripLabel(event)}
        aria-hidden={decorative ? true : undefined}
        className={`absolute inset-x-0 bottom-0 flex items-end gap-[3px] px-4 ${STRIP_HEIGHT[size]}`}
      >
        {event.ratings.length === 0 ? (
          <span aria-hidden="true" className="h-[3px] w-full bg-[var(--text)]/25" />
        ) : (
          event.ratings.map((slot, index) => (
            <span
              key={slot.position}
              aria-hidden="true"
              className={`bar${slot.stars >= 4 ? " bar-hi" : ""}${animate ? " bar-rise" : ""}`}
              style={
                animate
                  ? { height: `${barHeight(slot.stars)}%`, animationDelay: `${index * 40}ms` }
                  : { height: `${barHeight(slot.stars)}%` }
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
