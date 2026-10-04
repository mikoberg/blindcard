import type { CardFight, CardSegment } from "./types";

export const SEGMENT_ORDER: readonly CardSegment[] = ["main", "prelim", "early_prelim"];

export const SEGMENT_LABELS: Record<CardSegment, string> = {
  main: "Main card",
  prelim: "Prelims",
  early_prelim: "Early prelims",
};

export interface SegmentGroup {
  segment: CardSegment;
  fights: CardFight[];
}

/**
 * The card split into its parts, in running order (main card first), each part in card order.
 * All or nothing: if even one fight lacks a segment the card cannot be split reliably, so this
 * returns null and the page shows one flat list.
 */
export function groupBySegment(fights: readonly CardFight[]): SegmentGroup[] | null {
  if (fights.length === 0 || fights.some((fight) => fight.cardSegment === null)) return null;
  return SEGMENT_ORDER.map((segment) => ({
    segment,
    fights: fights
      .filter((fight) => fight.cardSegment === segment)
      .sort((a, b) => a.cardPosition - b.cardPosition),
  })).filter((group) => group.fights.length > 0);
}
