/**
 * Where a fight stood on the bill: the main event or the co-main event. It sits above the "vs" of the
 * matchup, on the fight's own card, so the position is something you see and not a line of text.
 *
 * Both are belt plates, pointed at both ends like the classic badge (the shapes are in globals.css).
 * The main event is the loud one: a stamp-red face in an ink rim. The co-main is the same plate with a
 * paper face, so the two read as one family and the main event is plainly the bigger of the two.
 */
export function BillingMark({ position }: { position: number | null | undefined }) {
  if (position !== 1 && position !== 2) return null;
  const main = position === 1;
  return (
    <span className="billing-plate inline-flex shrink-0">
      <span
        className={`billing-face m-[1.5px] inline-flex items-center whitespace-nowrap px-2 py-[2px] text-[0.64rem] leading-none ${
          main ? "billing-face-main font-extrabold text-[var(--accent-ink)]" : "billing-face-co font-bold text-[var(--text)]"
        }`}
      >
        {main ? "Main event" : "Co-main"}
      </span>
    </span>
  );
}
