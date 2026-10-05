import Link from "next/link";

/** "Blind" and, blacked out like a redaction, "card". */
export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="Blindcard, home"
      className="display inline-flex min-h-11 items-center text-[1.65rem] leading-none"
    >
      <span>Blind</span>
      <span className="redact px-1.5 pb-[0.12em] pt-[0.08em]">card</span>
    </Link>
  );
}
