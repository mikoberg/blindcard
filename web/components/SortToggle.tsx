import Link from "next/link";

const OPTIONS = [
  { key: "newest", href: "/", label: "Newest first" },
  { key: "rating", href: "/best", label: "Best card rating" },
] as const;

/** Switch between the chronological overview and the ranking by card rating. Plain links. */
export function SortToggle({ active }: { active: (typeof OPTIONS)[number]["key"] }) {
  return (
    <nav aria-label="Sort events" className="inline-flex rounded-full bg-[var(--surface)] p-1">
      {OPTIONS.map((option) => {
        const current = option.key === active;
        return (
          <Link
            key={option.key}
            href={option.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${
              current ? "redact" : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
