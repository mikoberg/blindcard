import Link from "next/link";
import { formatRating, isHighRating } from "@/lib/leaderboard/format";
import { isValidSlug } from "@/lib/slug";
import { Monogram } from "./Monogram";

const ROW = "flex items-center gap-3 px-3 py-3 sm:px-4";

interface FighterRowProps {
  /** The place on the leaderboard; left out for a search result. */
  rank?: number;
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  average: number;
  /** A short line under the number of fights, e.g. why the fighter is not ranked. */
  note?: string;
}

/** One fighter: flag, name, number of rated fights and the average rating. Opens their fights. */
export function FighterRow({ rank, slug, name, country, fights, average, note }: FighterRowProps) {
  const content = (
    <>
      {rank !== undefined && (
        <span className="w-8 shrink-0 text-right font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-[var(--muted)]">
          {rank}
        </span>
      )}
      <Monogram name={name} country={country} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
          {name}
        </span>
        <span className="block text-sm text-[var(--muted)]">
          {fights} rated {fights === 1 ? "fight" : "fights"}
          {note ? `, ${note}` : ""}
        </span>
      </span>
      <span
        className={`shrink-0 font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums ${isHighRating(average) ? "text-[var(--accent)]" : ""}`}
        role="img"
        aria-label={`Average rating ${formatRating(average)} out of 5`}
      >
        <span aria-hidden="true">{formatRating(average)}</span>
      </span>
    </>
  );
  return isValidSlug(slug) ? (
    <Link href={`/fighters/${slug}`} className={`${ROW} hover:bg-[var(--surface-2)]`}>
      {content}
    </Link>
  ) : (
    <div className={ROW}>{content}</div>
  );
}
