import { flagCode } from "@/lib/card/country";
import { initials } from "@/lib/card/initials";
import { posterArt } from "@/lib/overview/poster";

/**
 * A fighter's initials on their country's flag (a colour taken from the name when the country
 * is not known). Decorative: the name is always written out next to it.
 */
export function Monogram({ name, country }: { name: string; country?: string | null }) {
  const flag = flagCode(country);
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full font-[family-name:var(--font-display)] text-base font-bold ring-2 ring-[var(--surface)]"
      style={{
        backgroundColor: posterArt(name).slab,
        backgroundImage: flag ? `url(/flags/${flag}.svg)` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "var(--text)",
      }}
    >
      {flag && <span className="absolute inset-0 bg-black/40" />}
      <span className="relative [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">{initials(name)}</span>
    </span>
  );
}
