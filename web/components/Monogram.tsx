import { flagCode } from "@/lib/card/country";
import { initials } from "@/lib/card/initials";

const SIZE = { sm: "h-7 w-7 text-[0.62rem]", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" } as const;

/**
 * A fighter's initials on their country's flag (plain ink when the country is not known).
 * Decorative: the name is always written out next to it.
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
      className={`display-tight relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--text)] bg-[var(--text)] ${SIZE[size]}`}
      style={{
        backgroundImage: flag ? `url(/flags/${flag}.svg)` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "#fff",
      }}
    >
      {flag && <span className="absolute inset-0 bg-[var(--text)]/55" />}
      <span className="relative">{initials(name)}</span>
    </span>
  );
}
