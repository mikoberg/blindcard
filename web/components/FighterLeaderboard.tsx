import type { LeaderboardEntry } from "@/lib/leaderboard/types";
import { Monogram } from "./Monogram";

/** The ranked fighters: rank, flag, name, number of fights and the average rating. */
export function FighterLeaderboard({ entries }: { entries: readonly LeaderboardEntry[] }) {
  return (
    <ol className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <span className="w-8 shrink-0 text-right font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-[var(--muted)]">
            {entry.rank}
          </span>
          <Monogram name={entry.name} country={entry.country} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
              {entry.name}
            </span>
            <span className="block text-sm text-[var(--muted)]">
              {entry.fights} rated fights, average {entry.average.toFixed(1)}
            </span>
          </span>
          <span
            className={`shrink-0 font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums ${entry.score >= 4 ? "text-[var(--accent)]" : ""}`}
            role="img"
            aria-label={`Fighter rating ${entry.score.toFixed(1)} out of 5`}
          >
            <span aria-hidden="true">{entry.score.toFixed(1)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
