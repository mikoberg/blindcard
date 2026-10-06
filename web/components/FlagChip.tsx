import { flagCode } from "@/lib/card/country";

/**
 * A small flag for list rows: a plain flag with a hairline border, or an empty chip of the same
 * size when the country is not known, so names line up. Decorative; the name is written out.
 */
export function FlagChip({ country }: { country: string | null | undefined }) {
  const flag = flagCode(country);
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-6 shrink-0 rounded-[2px] border border-[var(--border)] bg-[var(--surface-2)]"
      style={
        flag
          ? { backgroundImage: `url(/flags/${flag}.svg)`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
    />
  );
}
