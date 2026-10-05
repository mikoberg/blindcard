import { flagCode } from "@/lib/card/country";
import { initials } from "@/lib/card/initials";
import { posterArt } from "@/lib/overview/poster";

const SIZE = { md: "h-9 w-9 text-base", lg: "h-11 w-11 text-lg" } as const;

/**
 * A fighter's initials on their country's flag (a colour taken from the name when the country
 * is not known). Decorative: the name is always written out next to it.
 */
export function Monogram({
  name,
  country,
  size = "md",
}: {
  name: string;
  country?: string | null;
  size?: keyof typeof SIZE;
}) {
  const flag = flagCode(country);
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-[family-name:var(--font-display)] font-bold ring-2 ring-[var(--surface)] ${SIZE[size]}`}
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
