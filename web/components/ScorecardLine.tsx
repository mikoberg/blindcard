import Link from "next/link";
import { splitScorecard } from "@/lib/judges/parse";
import { isValidSlug } from "@/lib/slug";

/**
 * One scorecard of a revealed fight: the judge's name links to their page (how consistent they
 * are with the other judges). Text that does not look like a scorecard is shown as it is.
 */
export function ScorecardLine({ text }: { text: string }) {
  const line = splitScorecard(text);
  if (!line || !line.slug || !isValidSlug(line.slug)) return <>{text}</>;
  return (
    <>
      <Link
        href={`/judges/${line.slug}`}
        className="font-semibold text-[var(--text)] underline decoration-[var(--accent)]/60 underline-offset-4 hover:decoration-[var(--accent)]"
      >
        {line.judge}
      </Link>{" "}
      {line.scores}
    </>
  );
}
