import type { CardFight, FighterCareer } from "./types";

/** A streak this long is worth a note. */
export const MIN_STREAK = 3;

/** "Rematch" or "Meeting number 3": what the two fighters' earlier bouts say about the pairing. */
export function pairingLabel(fight: CardFight): string | null {
  const meetings = fight.career?.meetings ?? 0;
  if (meetings === 1) return "Rematch";
  if (meetings >= 2) return `Meeting number ${meetings + 1}`;
  return null;
}

/** A short note under a fighter's name: a debut, unbeaten, or a win streak. Earlier bouts only. */
export function fighterNote(career: FighterCareer | null | undefined): string | null {
  if (!career) return null;
  const r = career.record;
  if (r && r.w + r.l + r.d + r.nc === 0) return "Promotion debut";
  if (career.unbeaten) return "Unbeaten in the promotion";
  if (career.streak >= MIN_STREAK) return `Won ${career.streak} in a row`;
  return null;
}
