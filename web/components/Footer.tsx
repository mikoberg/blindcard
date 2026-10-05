import Link from "next/link";

const LINKS = [
  { href: "/about", label: "About and method" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact and corrections" },
] as const;

export function Footer() {
  return (
    <footer className="space-y-3 border-t-2 border-[var(--text)] py-6 text-sm text-[var(--muted)]">
      <nav aria-label="About this site" className="flex flex-wrap gap-x-5">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center font-semibold text-[var(--text)] underline underline-offset-4 hover:text-[var(--accent)]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p>Unofficial fan project, not affiliated with any promotion.</p>
    </footer>
  );
}
