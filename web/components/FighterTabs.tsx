import Link from "next/link";

/**
 * The two lists of fighters, side by side: who is worth watching (the home of this section) and
 * who is strongest by Elo. Plain links, so the way to the Elo list is always one tap from the main
 * list and back.
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
      </Link>
    </nav>
  );
}
