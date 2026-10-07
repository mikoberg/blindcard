import { eventLabel, labelFontSize, matchupFontSize, posterNames } from "@/lib/overview/matchup";
import { barHeight } from "@/lib/overview/poster";
import { stripLabel } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";

type Size = "sm" | "md" | "lg";

/** Least height; the poster grows with its type, so the strip never covers a name. */
const HEIGHT: Record<Size, string> = {
  sm: "min-h-52",
  md: "min-h-60",
  lg: "min-h-52",
};

/** The strip sits on the bottom edge at a fixed height, so the type above it never collides. */
const STRIP_HEIGHT: Record<Size, string> = {
  sm: "h-12",
  md: "h-14",
  lg: "h-14",
};

/** Space kept free under the type for the strip. */
const STRIP_SPACE: Record<Size, string> = {
  sm: "pb-14",
  md: "pb-[4.25rem]",
  lg: "pb-[4.25rem]",
};

/** Average width of a capital / of a label letter in the poster typeface (wide Archivo), in em. */
const CAPITAL_EM = 0.92;
const LABEL_EM = 0.7;

/** Largest size of the matchup type, in cqw (1% of the poster's width). */
const TYPE_CQW: Record<Size, number> = { sm: 9, md: 9.5, lg: 7.5 };
/** Largest size of the event label line above the names, in cqw. */
const LABEL_CQW: Record<Size, number> = { sm: 5.4, md: 4.2, lg: 3.2 };

/**
 * A typographic bill for one event: the main event's two family names set large in ink on the
 * paper, and the rating strip (one column per rated fight in card order) on a ruled baseline.
 * Built from names and star ratings only: no photos, no logos, no results.
 * `header` and `footer` sit above and below the matchup.
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
  const main = event.mainEvent;
  const names = main ? posterNames(event.name, main.a, main.b) : [event.name];
  const fontSize = matchupFontSize(names, TYPE_CQW[size], CAPITAL_EM);
  const label = eventLabel(event.name);
  return (
    <div className={`poster-box relative isolate flex flex-col overflow-hidden ${HEIGHT[size]}${size === "lg" ? " [&_.bar]:max-w-none" : ""}`}>
      <div className={`relative flex flex-1 flex-col justify-end gap-2 px-4 pt-4 sm:px-5 sm:pt-5 ${STRIP_SPACE[size]}`}>
        {main && (
          <p
            className="poster-label mb-auto max-w-[70%] pb-5"
            style={{ fontSize: `${labelFontSize(label, LABEL_CQW[size], LABEL_EM)}cqw` }}
            aria-hidden="true"
          >
            {label}
          </p>
        )}
        {header}
        {main ? (
          <div
            className={`poster-type${main.title ? " poster-gold" : ""}`}
            style={{ fontSize: `${fontSize}cqw` }}
            aria-hidden="true"
          >
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
      {main?.title && !decorative && <p className="sr-only">Title fight</p>}
      <div
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : stripLabel(event)}
        aria-hidden={decorative ? true : undefined}
        className={`absolute inset-x-0 bottom-0 flex items-end gap-[3px] border-b-2 border-[var(--text)] px-4 sm:px-5 ${STRIP_HEIGHT[size]}`}
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
