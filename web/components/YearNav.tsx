import Link from "next/link";

/**
 * A row of years. By default jump links to the year sections of the same page (plain anchors, no
 * script needed). With `base`, each year links to its own page at `${base}/${year}`, and `current`
 * marks the year being shown.
 */
export function YearNav({
  years,
  base,
  current,
  sticky = true,
}: {
  years: readonly string[];
  base?: string;
  current?: string;
  sticky?: boolean;
}) {
  const item = "display-tight inline-flex min-h-11 items-center px-3 text-lg hover:bg-[var(--text)] hover:text-[var(--bg)]";
  return (
    <nav
      aria-label="Years"
      className={`${sticky ? "sticky top-0 z-20 " : ""}-mx-4 border-y-2 border-[var(--text)] bg-[var(--bg)] px-4 sm:-mx-6 sm:px-6`}
    >
      <ul className="-ml-3 flex overflow-x-auto py-0.5">
        {years.map((year) => {
          const isCurrent = year === current;
          const className = `${item} ${isCurrent ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"}`;
          return (
            <li key={year} className="shrink-0">
              {base === undefined ? (
                <a href={`#year-${year}`} className={className}>
                  {year}
                </a>
              ) : (
                <Link href={`${base}/${year}`} aria-current={isCurrent ? "page" : undefined} className={className}>
                  {year}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
