import Link from "next/link";

/**
 * The two lists of fighters, side by side: who is worth watching (the home of this section) and
 * who is strongest by Elo (a spoiler page, marked with a lock). Plain links, so the way to the Elo
 * list is always one tap from the main list and back.
 */
export function FighterTabs({ active }: { active: "watch" | "elo" }) {
  const tab = (current: boolean) =>
    `inline-flex min-h-11 items-center gap-2 px-4 text-sm font-bold ${
      current ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
    }`;
  return (
    <nav aria-label="Fighter lists" className="inline-flex flex-wrap border-2 border-[var(--text)]">
      <Link href="/fighters" aria-current={active === "watch" ? "page" : undefined} className={tab(active === "watch")}>
        Worth watching
      </Link>
      <Link href="/fighters/elo" aria-current={active === "elo" ? "page" : undefined} className={tab(active === "elo")}>
        Strongest (Elo)
        <span className="inline-flex items-center gap-1 text-xs font-semibold opacity-80">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="1" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          spoilers
        </span>
      </Link>
    </nav>
  );
}
