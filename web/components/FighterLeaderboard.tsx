import type { LeaderboardEntry } from "@/lib/leaderboard/types";
import { FIGHTS_COL, FighterRow, RANK_COL } from "./FighterRow";

/** The column titles of a list of fighters; hidden on a phone, where the rows say it themselves. */
export function ListHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="hidden items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--muted)] sm:flex"
    >
      {children}
    </div>
  );
}

/**
 * The ranked fighters: rank, flag, name, number of fights and the average rating. Each row opens the
 * fights behind the average. When the list is ordered by something else, that number gets a column.
 */
export function FighterLeaderboard({
  entries,
  extra = null,
}: {
  entries: readonly LeaderboardEntry[];
  extra?: {
    label: string;
    value: (entry: LeaderboardEntry) => number | null;
    format?: (value: number) => string;
    detail?: (entry: LeaderboardEntry) => string | null;
  } | null;
}) {
  return (
    <div className="border-2 border-[var(--text)] bg-[var(--surface)]">
      <ListHeader>
        <span className={RANK_COL}>#</span>
        <span className="w-6 shrink-0" />
        <span className="flex-1">Fighter</span>
        <span className={FIGHTS_COL}>Rated fights</span>
        {extra && <span className="w-24 shrink-0 text-right">{extra.label}</span>}
        <span className="w-12 shrink-0 text-center">Rating</span>
      </ListHeader>
      <ol className="divide-y divide-[var(--border)]">
        {entries.map((entry) => (
          <li key={entry.id}>
            <FighterRow
              rank={entry.rank}
              slug={entry.slug}
              name={entry.name}
              country={entry.country}
              fights={entry.fights}
              average={entry.average}
              extra={
                extra
                  ? {
                      label: extra.label,
                      value: extra.value(entry),
                      format: extra.format,
                      detail: extra.detail ? extra.detail(entry) : null,
                    }
                  : undefined
              }
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
