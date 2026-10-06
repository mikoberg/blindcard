import type { CardFight } from "./types";

export type BlurbInput = Pick<CardFight, "cardPosition" | "isTitleFight" | "weightClass" | "scheduledRounds">;

const ROUND_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

function roundsPhrase(rounds: number | null): string {
  if (rounds === null || !Number.isInteger(rounds) || rounds < 1) return "";
  const word = ROUND_WORDS[rounds] ?? String(rounds);
  return `, scheduled for ${word} ${rounds === 1 ? "round" : "rounds"}`;
}

/**
 * Template text from pre-fight facts only (title flag, weight class, scheduled rounds; the place on
 * the bill is a mark above the "vs", see BillingMark). Never add anything derived from a result or from round statistics.
 */
export function fightBlurb(input: BlurbInput): string {
  const weightClass = input.weightClass?.trim() || null;
  const subject = input.isTitleFight
    ? weightClass
      ? `${weightClass} title fight`
      : "Title fight"
    : weightClass
      ? `${weightClass} bout`
      : "Bout";
  return `${subject}${roundsPhrase(input.scheduledRounds)}.`;
}
