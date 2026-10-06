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

/** The ranked fighters: rank, flag, name, number of fights and the average rating. Each row opens the fights behind the average. */
export function FighterLeaderboard({ entries }: { entries: readonly LeaderboardEntry[] }) {
  return (
    <div className="border-2 border-[var(--text)] bg-[var(--surface)]">
      <ListHeader>
        <span className={RANK_COL}>#</span>
        <span className="w-6 shrink-0" />
        <span className="flex-1">Fighter</span>
        <span className={FIGHTS_COL}>Rated fights</span>
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
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
