import Link from "next/link";

const OPTIONS = [
  { key: "newest", href: "/", label: "Newest first" },
  { key: "rating", href: "/best", label: "Best card rating" },
] as const;

/** Switch between the chronological overview and the ranking by card rating. Plain links. */
export function SortToggle({ active }: { active: (typeof OPTIONS)[number]["key"] }) {
  return (
    <nav aria-label="Sort events" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const current = option.key === active;
        return (
          <Link
            key={option.key}
            href={option.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              current
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
