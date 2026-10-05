import { videoUrl } from "@/lib/card/watch";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-0.5 h-3.5 w-3.5" fill="currentColor">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

/**
 * "Watch the fight": a link to the fight's official video on YouTube, opened in a new tab. We
 * redirect and show nothing of the video here, so no title or thumbnail can give away the result;
 * the note says what to expect there.
 */
export function WatchButton({
  fighterA,
  fighterB,
  videoId,
  compact = false,
}: {
  fighterA: string;
  fighterB: string;
  videoId: string | null | undefined;
  compact?: boolean;
}) {
  const href = videoUrl(videoId);
  if (href === null) return null;
  const label = `Watch ${fighterA} versus ${fighterB} on YouTube (opens in a new tab)`;
  const circle =
    "flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-transform group-hover:scale-110";
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title="Official video on YouTube. The title and comments there can reveal the result."
        className="group inline-flex min-h-11 min-w-11 items-center justify-center"
      >
        <span className={`${circle} h-9 w-9`}>
          <PlayIcon />
        </span>
      </a>
    );
  }
  return (
    <div className="mt-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="group inline-flex min-h-11 items-center gap-2.5 rounded-full border border-[var(--accent)]/70 py-1 pl-1 pr-4 text-sm font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
      >
        <span className={`${circle} h-8 w-8`}>
          <PlayIcon />
        </span>
        Watch the fight
      </a>
      <p className="mt-1.5 text-xs text-[var(--muted)]">
        Official video on YouTube. The title and comments there can reveal the result.
      </p>
    </div>
  );
}
