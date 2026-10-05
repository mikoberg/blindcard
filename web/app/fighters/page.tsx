import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { FighterLeaderboard } from "@/components/FighterLeaderboard";
import { FighterSearch } from "@/components/FighterSearch";
import { Notice } from "@/components/Notice";
import { listFighterRatings } from "@/lib/data/leaderboard";
import { MIN_FIGHTS, rankFighters } from "@/lib/leaderboard/rank";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Fighter leaderboard",
  description: "Fighters ranked by the average rating of their fights, with no results.",
  path: "/fighters",
  root: true,
});

const SHOWN = 100;

export default async function FightersPage() {
  const ranked = rankFighters(await listFighterRatings());
  if (ranked.length === 0) return <Notice>No fighters to rank yet. Check back soon.</Notice>;
  return (
    <div className="space-y-6">
      <section aria-labelledby="fighters">
        <h1
          id="fighters"
          className="display text-5xl font-bold leading-[0.95] sm:text-7xl"
        >
          Fighters worth watching
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Fighters ranked by the average rating of their fights. A fighter needs at least {MIN_FIGHTS}{" "}
          rated fights to be listed, so one great fight is not enough.
        </p>
      </section>
      <FighterSearch>
        <FighterLeaderboard entries={ranked.slice(0, SHOWN)} />
      </FighterSearch>
    </div>
  );
}
