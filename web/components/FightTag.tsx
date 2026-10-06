import type { ReactNode } from "react";

/** The small marks on a fight: where on the card, a title, a hidden gem, a rematch. */
export type FightTagKind = "segment" | "title" | "gem" | "pairing";

const BASE =
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-xs font-bold leading-none";

const LOOK: Record<FightTagKind, string> = {
  // quiet: a place on the card, not a quality of the fight
  segment: "bg-[var(--surface-2)] text-[var(--muted)]",
  // the strongest mark of the three: ink, like the rank chip
  title: "bg-[var(--text)] text-[var(--surface)]",
  gem: "border-[1.5px] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent-text)]",
  pairing: "border-[1.5px] border-[var(--text)]/35 text-[var(--text)]",
};

const ICON = "h-3 w-3 shrink-0";

function Icon({ kind }: { kind: FightTagKind }): ReactNode {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true, className: ICON, fill: "none", stroke: "currentColor" } as const;
  switch (kind) {
    case "title": // a belt plate with a centre boss
      return (
        <svg {...common} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16l2 5-2 5H4l-2-5z" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "gem": // a cut stone
      return (
        <svg {...common} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l4 6-10 12L2 9z" />
          <path d="M2 9h20M9 3l3 6 3-6M12 9v12" strokeWidth="1.6" />
        </svg>
      );
    case "pairing": // two arrows in a loop: they have met before
      return (
        <svg {...common} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3l4 4-4 4" />
          <path d="M3 11V9a2 2 0 012-2h16" />
          <path d="M7 21l-4-4 4-4" />
          <path d="M21 13v2a2 2 0 01-2 2H3" />
        </svg>
      );
    default:
      return null;
  }
}

/** One mark on a fight. The icon is decorative: the words say what it means. */
export function FightTag({ kind, children }: { kind: FightTagKind; children: ReactNode }) {
  return (
    <span className={`${BASE} ${LOOK[kind]}`}>
      <Icon kind={kind} />
      {children}
    </span>
  );
}
