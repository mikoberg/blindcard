/** Jump links to the year sections of the overview. Plain anchors: no script needed. */
export function YearNav({ years }: { years: readonly string[] }) {
  return (
    <nav
      aria-label="Years"
      className="sticky top-0 z-20 -mx-4 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 backdrop-blur"
    >
      <ul className="-ml-3 flex gap-1 overflow-x-auto py-1">
        {years.map((year) => (
          <li key={year} className="shrink-0">
            <a
              href={`#year-${year}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              {year}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
