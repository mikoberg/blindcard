import { initials } from "@/lib/card/initials";
import { posterArt } from "@/lib/overview/poster";

/**
 * A fighter's initials on a colour taken from the name (never from anything about the fight).
 * Decorative: the name is always written out next to it.
 */
export function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-display)] text-base font-bold ring-2 ring-[var(--surface)]"
      style={{ backgroundColor: posterArt(name).slab, color: "var(--text)" }}
    >
      {initials(name)}
    </span>
  );
}
