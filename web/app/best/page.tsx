import type { Metadata } from "next";
import { EventCard } from "@/components/EventCard";
import { Notice } from "@/components/Notice";
import { SortToggle } from "@/components/SortToggle";
import { listEventSummaries } from "@/lib/data/overview";
import { eventStats, rankByCardRating } from "@/lib/overview/summary";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

/** A card needs this many rated fights to be ranked: one great fight does not make a great card. */
const MIN_RATED = 5;
/** The ranking shows this many cards. Every event is still on its year page. */
const TOP = 60;

export const metadata: Metadata = pageMetadata({
  title: "Best cards",
  description: "The best-rated fight cards, ranked by the average rating of their fights, without any results.",
  path: "/best",
  root: true,
});

export default async function BestPage() {
  const events = rankByCardRating(await listEventSummaries())
    .filter((event) => eventStats(event).ratedCount >= MIN_RATED)
    .slice(0, TOP);
  if (events.length === 0) return <Notice>No events yet. Check back soon.</Notice>;
  return (
    <div className="space-y-6">
      <section aria-labelledby="best">
        <h1 id="best" className="display text-5xl font-bold leading-[0.95] sm:text-7xl">
          Best cards
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          The {TOP} best-rated cards: the average of all their fight ratings, for cards with at least{" "}
          {MIN_RATED} rated fights.
        </p>
      </section>
      <SortToggle active="rating" />
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ol>
    </div>
  );
}
