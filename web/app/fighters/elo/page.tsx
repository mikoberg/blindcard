import type { Metadata } from "next";
import Link from "next/link";
import { EloBoard } from "@/components/EloBoard";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Strongest fighters (spoilers)",
  description:
    "An Elo leaderboard of the strongest active fighters. It is built from past results, so it sits behind a spoiler warning and a click.",
  path: "/fighters/elo",
  root: true,
});

export default function EloPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <Link
        href="/fighters"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--accent)]"
      >
        All fighters
      </Link>
      <header className="space-y-4">
        <h1 className="page-title">Strongest fighters</h1>
        <p className="max-w-xl text-lg text-[var(--muted)]">
          Who is strongest right now, by Elo rating. Unlike the rest of Blindcard this list is about results, not
          about how fun a fight was.
        </p>
      </header>

      <EloBoard />

      <section aria-labelledby="how" className="max-w-xl space-y-3 border-t-2 border-[var(--text)] pt-6">
        <h2 id="how" className="display text-xl sm:text-2xl">
          How it works
        </h2>
        <p>
          Everyone starts at 1500. After each fight the fighter who won takes points from the other: more when they were
          the underdog, more for a finish than for a decision, and less for a split decision. Fighters with few
          fights move faster than veterans.
        </p>
        <p>
          Only fighters with at least eight decisive fights who fought in the last two years are listed. Draws and
          no contests do not count. Weight classes are not taken into account, and only the fights in our data are
          seen, so a fighter&apos;s earlier career elsewhere is not in the number.
        </p>
        <p>
          A rating is a summary of results, not a prediction. On past fights, the fighter with the higher rating won
          about 54 percent of the time (a coin flip is 50). This is not betting advice.
        </p>
      </section>
    </div>
  );
}
