import type { LeaderboardEntry } from "@/lib/leaderboard/types";
import { FighterRow } from "./FighterRow";

/** The ranked fighters: rank, flag, name, number of fights and the average rating. Each row opens the fights behind the average. */
export function FighterLeaderboard({ entries }: { entries: readonly LeaderboardEntry[] }) {
  return (
    <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-lg bg-[var(--surface)]">
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
  );
}
