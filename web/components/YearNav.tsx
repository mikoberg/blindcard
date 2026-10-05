/** Jump links to the year sections of the overview. Plain anchors: no script needed. */
export function YearNav({ years }: { years: readonly string[] }) {
  return (
    <nav
      aria-label="Years"
      className="sticky top-0 z-20 -mx-4 border-y-2 border-[var(--text)] bg-[var(--bg)] px-4 sm:-mx-6 sm:px-6"
    >
      <ul className="-ml-3 flex overflow-x-auto py-0.5">
        {years.map((year) => (
          <li key={year} className="shrink-0">
            <a
              href={`#year-${year}`}
              className="display-tight inline-flex min-h-11 items-center px-3 text-lg text-[var(--muted)] hover:bg-[var(--text)] hover:text-[var(--bg)]"
            >
              {year}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
