import { matchupFontSize, surname } from "@/lib/overview/matchup";
import { barHeight, posterArt } from "@/lib/overview/poster";
import { stripLabel } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";

type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, string> = {
  sm: "h-36",
  md: "h-48",
  lg: "min-h-72",
};

/** The strip sits on the bottom edge at a fixed height, so the type above it never collides. */
const STRIP_HEIGHT: Record<Size, string> = {
  sm: "h-12",
  md: "h-16",
  lg: "h-24",
};

/** Space kept free under the type for the strip. */
const STRIP_SPACE: Record<Size, string> = {
  sm: "pb-14",
  md: "pb-[4.75rem]",
  lg: "pb-28",
};

/** Largest size of the matchup type, in cqw (1% of the poster's width). */
const TYPE_CQW: Record<Size, number> = { sm: 10, md: 14.5, lg: 11 };

/**
 * A typographic poster for one event: the main event's two family names set large, the colour
 * art generated from the event's name, and the rating strip (one bar per rated fight in card
 * order). Built from names and star ratings only: no photos, no logos, no results.
 * `header` and `footer` sit above and below the matchup (the event page puts its text there).
 */
export function EventPoster({
  event,
  size,
  animate = false,
  decorative = false,
  header,
  footer,
}: {
  event: EventSummary;
  size: Size;
  animate?: boolean;
  /** Hide the poster's wording and strip from assistive tech (a card around it says it). */
  decorative?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const art = posterArt(event.name);
  const main = event.mainEvent;
  const names = main ? [surname(main.a), surname(main.b)] : [event.name];
  const fontSize = matchupFontSize(names, TYPE_CQW[size]);
  return (
    <div
      className={`poster-box relative isolate overflow-hidden ${HEIGHT[size]}`}
      style={{ backgroundColor: art.ground }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ backgroundColor: art.slab, clipPath: art.cut }}
      />
      <div aria-hidden="true" className="poster-stripes absolute inset-0 -z-10" />
      <div className={`relative flex h-full flex-col justify-end gap-2 p-4 ${STRIP_SPACE[size]}`}>
        {header}
        {main ? (
          <div className="poster-type" style={{ fontSize: `${fontSize}cqw` }} aria-hidden="true">
            <span className="block">{names[0]}</span>
            <span className="poster-vs block">vs</span>
            <span className="block">{names[1]}</span>
          </div>
        ) : size !== "lg" ? (
          <p className="poster-type" style={{ fontSize: `${fontSize}cqw` }} aria-hidden="true">
            {event.name}
          </p>
        ) : null}
        {footer}
      </div>
      {main?.title && (
        <span className="absolute right-3 top-3 rounded-sm bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-ink)]">
          Title fight
        </span>
      )}
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
