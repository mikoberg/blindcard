import { placeInfo } from "@/lib/upcoming/place";

function Pin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="currentColor">
      <path d="M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 5.4 6.3 12.2 6.8 12.8a1 1 0 0 0 1.4 0c.5-.6 6.8-7.4 6.8-12.8A7.5 7.5 0 0 0 12 1.5zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" />
    </svg>
  );
}

/**
 * Where the event is and how far its clock is from Amsterdam. Outside the Americas the chip is
 * marked, because such a card starts at a very different time from a US one.
 */
export function PlaceChip({ location, isoDate }: { location: string | null; isoDate: string }) {
  const info = placeInfo(location, isoDate);
  if (!info) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 font-bold ${
          info.away
            ? "border-2 border-[var(--accent)] text-[var(--accent)]"
            : "border-2 border-[var(--text)]/35 text-[var(--text)]"
        }`}
      >
        <Pin />
        {info.city}
      </span>
      {info.offset && (
        <span className={info.away ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}>
          {info.offset}
        </span>
      )}
    </p>
  );
}
