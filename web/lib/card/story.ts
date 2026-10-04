import type { CardFight } from "./types";

/** A streak this long is worth a label. */
export const MIN_STREAK = 3;

/**
 * The storylines of a bout, known before it: a rematch, a long win streak, an unbeaten fighter.
 * Built only from the fighters' EARLIER bouts, so none of it says anything about this one.
 * Returned in a fixed order: rematch first, then fighter A, then fighter B.
 */
export function storyLabels(fight: CardFight): string[] {
  const career = fight.career;
  if (career === null) return [];
  const labels: string[] = [];
  if (career.meetings === 1) labels.push("Rematch");
  else if (career.meetings >= 2) labels.push(`Meeting number ${career.meetings + 1}`);

  const sides = [
    { name: fight.fighterA.name, info: career.a },
    { name: fight.fighterB.name, info: career.b },
  ];
  for (const { name, info } of sides) {
    if (info.unbeaten) labels.push(`${name} is unbeaten in the promotion`);
    else if (info.streak >= MIN_STREAK) labels.push(`${name} has won ${info.streak} in a row`);
  }
  return labels;
}
