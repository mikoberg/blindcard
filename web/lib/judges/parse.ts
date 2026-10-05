import { judgeSlug } from "./slug";

const CARD = /^(.*?)\s+(\d+)\s*-\s*(\d+)$/;
const NOTE_PREFIXES = ["Point Deducted", "Technical Decision", "Technical"];
const NAME_TAIL = /([A-Z][a-z'’.-]+(?: [A-Z][A-Za-z'’.-]+)+)$/;

export interface ScorecardLine {
  /** The judge's name, cleaned of notes the source sticks to it. */
  judge: string;
  /** The judge's page, or null when no usable slug comes out. */
  slug: string | null;
  /** The scores as written, e.g. "29 - 28". */
  scores: string;
}

/** Splits "Ron McCarthy 29 - 28" into the judge and the scores; null when it does not fit. */
export function splitScorecard(text: string): ScorecardLine | null {
  const match = CARD.exec(text.trim());
  if (!match) return null;
  let judge = (match[1] ?? "").trim();
  if (NOTE_PREFIXES.some((prefix) => judge.startsWith(prefix))) {
    const tail = NAME_TAIL.exec(judge);
    if (!tail) return null;
    judge = tail[1] ?? "";
  }
  if (judge === "") return null;
  const slug = judgeSlug(judge);
  return {
    judge,
    slug: slug === "" ? null : slug,
    scores: `${match[2]} - ${match[3]}`,
  };
}
