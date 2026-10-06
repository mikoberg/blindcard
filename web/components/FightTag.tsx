import type { ReactNode } from "react";
import { TitleBelt } from "./TitleBelt";

/**
 * The small marks on a fight: where on the card, a title, a hidden gem, a rematch.
 *
 * They are the same family as the rank chip beside the fighters: square-ish, set in the body face,
 * one height, no icons and no tints. What tells them apart is weight, in three steps: ink fill (the
 * fight is for a title), stamp fill (the rating is higher than the fight's billing suggests), a plain
 * ink outline (a fact about the pairing), and bare muted text for the place on the card.
 */
export type FightTagKind = "segment" | "title" | "gem" | "pairing";

const BASE = "inline-flex h-5 items-center whitespace-nowrap rounded-sm text-xs font-semibold leading-none";

const LOOK: Record<FightTagKind, string> = {
  segment: "text-[var(--muted)]",
  title: "bg-[var(--text)] px-1.5 text-[var(--surface)]",
  gem: "bg-[var(--accent)] px-1.5 text-[var(--accent-ink)]",
  pairing: "border border-[var(--text)] px-1.5 text-[var(--text)]",
};

/** The title tag is a belt, not words: `children` is not shown for it (the belt says "Title fight" to screen readers). */
export function FightTag({ kind, children }: { kind: FightTagKind; children: ReactNode }) {
  if (kind === "title") {
    return (
      <span className="inline-flex h-6 items-center">
        <TitleBelt className="h-6 w-[84px]" />
      </span>
    );
  }
  return <span className={`${BASE} ${LOOK[kind]}`}>{children}</span>;
}
