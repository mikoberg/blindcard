import type { CardFight } from "@/lib/card/types";

type Extra = Partial<Omit<CardFight, "rating">> & { percentile?: number };

/** A deterministic fight for tests. `stars = null` means "Not rated yet". */
export function makeFight(position: number, stars: number | null, extra: Extra = {}): CardFight {
  const { percentile = stars === null ? 0 : stars * 20, ...rest } = extra;
  return {
    id: `fight-${position}`,
    cardPosition: position,
    cardSegment: null,
    weightClass: "Lightweight",
    isTitleFight: false,
    scheduledRounds: 3,
    fighterA: { id: `a${position}`, name: `Alpha ${position}` },
    fighterB: { id: `b${position}`, name: `Beta ${position}` },
    rating: stars === null ? null : { stars, percentile },
    ...rest,
  };
}
