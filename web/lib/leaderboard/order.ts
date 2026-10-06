import type { LeaderboardEntry } from "./types";

/** How the fighters list can be ordered. The default is the average rating (the list as it comes). */
export type BoardOrder = "rating" | "potn" | "fotn" | "awards" | "fights";

export interface BoardOrderOption {
  id: BoardOrder;
  label: string;
  /** What the order counts, shown as a column when it is not the rating (null: no extra column). */
  column: string | null;
  value: (entry: LeaderboardEntry) => number | null;
}

export const BOARD_ORDERS: readonly BoardOrderOption[] = [
  { id: "rating", label: "Average rating", column: null, value: (e) => e.average },
  { id: "potn", label: "Most Performance of the Night bonuses", column: "POTN", value: (e) => e.awards?.potn ?? null },
  { id: "fotn", label: "Most Fight of the Night bonuses", column: "FOTN", value: (e) => e.awards?.fotn ?? null },
  {
    id: "awards",
    label: "Most night bonuses in all",
    column: "Bonuses",
    value: (e) => (e.awards ? e.awards.fotn + e.awards.potn : null),
  },
  { id: "fights", label: "Most rated fights", column: "Fights", value: (e) => e.fights },
];

export function orderById(id: string): BoardOrderOption {
  return BOARD_ORDERS.find((option) => option.id === id) ?? (BOARD_ORDERS[0] as BoardOrderOption);
}

/**
 * The entries in this order, numbered again from 1 (the rank is the place on THIS list). Ties go to
 * the better average rating, then to the fighter with more rated fights; a fighter without a value
 * for the order goes last. The default order leaves the list as it is.
 */
export function orderEntries(entries: readonly LeaderboardEntry[], order: BoardOrder): LeaderboardEntry[] {
  if (order === "rating") return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const option = orderById(order);
  return entries
    .map((entry) => ({ entry, key: option.value(entry) }))
    .sort((a, b) => {
      if (a.key === null && b.key !== null) return 1;
      if (a.key !== null && b.key === null) return -1;
      const byValue = a.key === null || b.key === null ? 0 : b.key - a.key;
      return (
        byValue ||
        b.entry.average - a.entry.average ||
        b.entry.fights - a.entry.fights ||
        a.entry.name.localeCompare(b.entry.name) ||
        a.entry.id.localeCompare(b.entry.id)
      );
    })
    .map((row, index) => ({ ...row.entry, rank: index + 1 }));
}
