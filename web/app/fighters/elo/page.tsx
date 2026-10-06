import type { Metadata } from "next";
import { EloBoard } from "@/components/EloBoard";
import { FighterTabs } from "@/components/FighterTabs";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Strongest fighters",
  description:
    "An Elo leaderboard of the strongest active fighters, built from past results, with the calculation behind every rating.",
  path: "/fighters/elo",
  root: true,
});

export default function EloPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <FighterTabs active="elo" />
      <header className="space-y-4">
        <h1 className="page-title">Strongest fighters</h1>
        <p className="max-w-xl text-lg text-[var(--muted)]">
          Who is strongest right now, by Elo rating. Unlike the rest of Blindcard this list is built from results, not
          from how fun a fight was.
        </p>
      </header>

      <EloBoard />

      <section aria-labelledby="how" className="max-w-xl space-y-3 border-t-2 border-[var(--text)] pt-6">
        <h2 id="how" className="display text-xl sm:text-2xl">
          How it works
        </h2>
        <p>
          This is standard Elo, the system chess uses. Everyone starts at 1500. Before a fight the two ratings give
          an expected score, the chance that the rating difference predicts. After the fight a rating moves by K ×
          (score − expected). A win scores 1 and a loss 0, a draw 0.5 for both; as Fight Matrix does, a split decision
          counts 0.667 and a majority decision 0.833 for the fighter who won.
        </p>
        <p>
          K is large for fighters with few fights and shrinks with experience, like the higher K that FIDE gives new
          players: 90 for a debut, about 35 after thirty fights. Open a fighter in the list to see every fight of the
          calculation.
        </p>
        <p>
          Only fighters with at least eight fights who fought in the last two years are listed. No contests do not
          count. Weight classes are not taken into account, and only the fights in our data are seen, so a
          fighter&apos;s earlier career elsewhere is not in the number.
        </p>
        <p>
          A rating is a summary of results, not a prediction. On past fights, the fighter with the higher rating won
          about 54 percent of the time (a coin flip is 50). This is not betting advice.
        </p>
      </section>
    </div>
  );
}
