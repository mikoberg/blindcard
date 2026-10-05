"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Events", match: (path: string) => path === "/" || path === "/best" || path.startsWith("/events") },
  { href: "/fighters", label: "Fighters", match: (path: string) => path.startsWith("/fighters") },
  { href: "/classics", label: "Classics", match: (path: string) => path.startsWith("/classics") },
] as const;

/** The main navigation. The current section is underlined in ink, like a line on a form. */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 sm:gap-2">
      {LINKS.map((link) => {
        const current = link.match(path);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-2 text-[0.95rem] font-semibold underline-offset-[10px] decoration-[var(--accent)] decoration-[3px] hover:text-[var(--accent)] sm:px-3 ${
              current ? "text-[var(--text)] underline" : "text-[var(--muted)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
