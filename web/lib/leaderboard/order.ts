import type { LeaderboardEntry } from "./types";

/** How the fighters list can be ordered. The default is the average rating (the list as it comes). */
export type BoardOrder =
  | "rating"
  | "fights"
  | "title"
  | "potn"
  | "fotn"
  | "awards"
  | "victories"
  | "ko"
  | "sub"
  | "dec"
  | "finishes"
  | "finishRate"
  | "r1"
  | "kd"
  | "sig"
  | "td"
  | "sa";

export type BoardGroup = "Ratings" | "Night bonuses" | "How they win" | "In the cage";

export interface BoardOrderOption {
  id: BoardOrder;
  label: string;
  group: BoardGroup;
  /** What the order counts, shown as a column when it is not the rating (null: no extra column). */
  column: string | null;
  value: (entry: LeaderboardEntry) => number | null;
  format: (value: number) => string;
  /** A short line under the number that says what it is made of ("9 of 12 victories"). */
  detail?: (entry: LeaderboardEntry) => string | null;
  /** Among equal numbers, more of this goes first (the better evidence), before the rating. */
  tie?: (entry: LeaderboardEntry) => number;
}

/** A finish rate needs this many wins behind it, so two wins out of two is not a 100% fighter. */
export const MIN_WINS_FOR_RATE = 5;

const count = (n: number): string => String(Math.round(n));
const percent = (n: number): string => `${Math.round(n)}%`;

function option(
  id: BoardOrder,
  label: string,
  group: BoardGroup,
  column: string | null,
  value: BoardOrderOption["value"],
  format: BoardOrderOption["format"] = count,
  extra: Pick<BoardOrderOption, "detail" | "tie"> = {},
): BoardOrderOption {
  return { id, label, group, column, value, format, ...extra };
}

export const BOARD_ORDERS: readonly BoardOrderOption[] = [
  option("rating", "Average rating", "Ratings", null, (e) => e.average),
  option("fights", "Most rated fights", "Ratings", "Fights", (e) => e.fights),
  option("title", "Most title fights", "Ratings", "Title", (e) => e.tally?.title ?? null),

  option("potn", "Most Performance of the Night bonuses", "Night bonuses", "POTN", (e) => e.awards?.potn ?? null),
  option("fotn", "Most Fight of the Night bonuses", "Night bonuses", "FOTN", (e) => e.awards?.fotn ?? null),
  option("awards", "Most night bonuses in all", "Night bonuses", "Bonuses", (e) =>
    e.awards ? e.awards.fotn + e.awards.potn : null,
  ),

  option("victories", "Most UFC victories", "How they win", "Victories", (e) => e.tally?.victories ?? null),
  option("ko", "Most knockouts", "How they win", "KOs", (e) => e.tally?.ko ?? null),
  option("sub", "Most submissions", "How they win", "Subs", (e) => e.tally?.sub ?? null),
  option("dec", "Most decisions", "How they win", "Dec.", (e) => e.tally?.dec ?? null),
  option("finishes", "Most finishes (knockouts and submissions)", "How they win", "Finishes", (e) =>
    e.tally ? e.tally.ko + e.tally.sub : null,
  ),
  option(
    "finishRate",
    `Highest finish rate (finishes per victory, from ${MIN_WINS_FOR_RATE} victories)`,
    "How they win",
    "Finish rate",
    (e) =>
      e.tally && e.tally.victories >= MIN_WINS_FOR_RATE
        ? ((e.tally.ko + e.tally.sub) / e.tally.victories) * 100
        : null,
    percent,
    {
      detail: (e) =>
        e.tally ? `${e.tally.ko + e.tally.sub} of ${e.tally.victories} victories` : null,
      // 100% from twelve victories says more than 100% from five
      tie: (e) => e.tally?.victories ?? 0,
    },
  ),
  option("r1", "Most first-round finishes", "How they win", "Round 1", (e) => e.tally?.r1 ?? null),

  option("kd", "Most knockdowns", "In the cage", "Knockdowns", (e) => e.tally?.kd ?? null),
  option("sig", "Most significant strikes landed", "In the cage", "Strikes", (e) => e.tally?.sig ?? null),
  option("td", "Most takedowns", "In the cage", "Takedowns", (e) => e.tally?.td ?? null),
  option("sa", "Most submission attempts", "In the cage", "Sub. att.", (e) => e.tally?.sa ?? null),
];

export const BOARD_GROUPS: readonly BoardGroup[] = ["Ratings", "Night bonuses", "How they win", "In the cage"];

export function orderById(id: string): BoardOrderOption {
  return BOARD_ORDERS.find((o) => o.id === id) ?? (BOARD_ORDERS[0] as BoardOrderOption);
}

/**
 * The entries in this order, numbered again from 1 (the rank is the place on THIS list). Ties go to
 * the better average rating, then to the fighter with more rated fights; a fighter without a value
 * for the order goes last. The default order leaves the list as it is.
 */
export function orderEntries(entries: readonly LeaderboardEntry[], order: BoardOrder): LeaderboardEntry[] {
  if (order === "rating") return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const chosen = orderById(order);
  return entries
    .map((entry) => ({ entry, key: chosen.value(entry) }))
    .sort((a, b) => {
      if (a.key === null && b.key !== null) return 1;
      if (a.key !== null && b.key === null) return -1;
      const byValue = a.key === null || b.key === null ? 0 : b.key - a.key;
      return (
        byValue ||
        (chosen.tie ? chosen.tie(b.entry) - chosen.tie(a.entry) : 0) ||
        b.entry.average - a.entry.average ||
        b.entry.fights - a.entry.fights ||
        a.entry.name.localeCompare(b.entry.name) ||
        a.entry.id.localeCompare(b.entry.id)
      );
    })
    .map((row, index) => ({ ...row.entry, rank: index + 1 }));
}
