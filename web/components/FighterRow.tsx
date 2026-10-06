import Link from "next/link";
import { formatRating, isHighRating } from "@/lib/leaderboard/format";
import { isValidSlug } from "@/lib/slug";
import { FlagChip } from "./FlagChip";

/** The columns every list of fighters shares, so the header and the rows line up. */
export const RANK_COL = "w-7 shrink-0 text-right";
export const FIGHTS_COL = "hidden w-20 shrink-0 text-right sm:block";
const ROW = "flex min-h-[3.25rem] items-center gap-3 px-3 py-2 sm:px-4";

interface FighterRowProps {
  /** The place on the leaderboard; left out for a search result. */
  rank?: number;
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  average: number;
  /** A short line under the name, e.g. why the fighter is not ranked. */
  note?: string;
  /** The number the list is ordered by, when that is not the rating (null value: not known). */
  extra?: { label: string; value: number | null; format?: (value: number) => string };
}

/** One fighter: rank, flag, name, number of rated fights and the average rating. Opens their fights. */
export function FighterRow({ rank, slug, name, country, fights, average, note, extra }: FighterRowProps) {
  const content = (
    <>
      {rank !== undefined && (
        <span className={`${RANK_COL} text-sm font-bold tabular-nums text-[var(--muted)]`}>{rank}</span>
      )}
      <FlagChip country={country} />
      <span className="min-w-0 flex-1">
        <span className="block break-words font-extrabold leading-tight sm:text-lg">{name}</span>
        <span className={`block text-xs text-[var(--muted)] ${note ? "" : "sm:hidden"}`}>
          {fights} rated {fights === 1 ? "fight" : "fights"}
          {note ? `, ${note}` : ""}
        </span>
      </span>
      <span className={`${FIGHTS_COL} text-sm tabular-nums text-[var(--muted)]`}>{fights}</span>
      {extra && (
        <span
          className="w-20 shrink-0 text-right text-lg font-extrabold tabular-nums"
          aria-label={
            extra.value === null
              ? `${extra.label}: not known`
              : `${extra.label}: ${extra.format ? extra.format(extra.value) : extra.value}`
          }
        >
          <span aria-hidden="true">
            {extra.value === null ? "–" : extra.format ? extra.format(extra.value) : extra.value}
          </span>
        </span>
      )}
      <span
        className={`scorebox h-8 w-12 shrink-0 text-base ${isHighRating(average) ? "scorebox-hot" : ""}`}
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
