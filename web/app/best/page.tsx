import type { Metadata } from "next";
import { EventCard } from "@/components/EventCard";
import { Notice } from "@/components/Notice";
import { SortToggle } from "@/components/SortToggle";
import { listEventSummaries } from "@/lib/data/overview";
import { rankByCardRating } from "@/lib/overview/summary";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Blindcard – Events by card rating" },
  alternates: { canonical: "/best" },
};

export default async function BestPage() {
  const events = rankByCardRating(await listEventSummaries());
  if (events.length === 0) return <Notice>No events yet. Check back soon.</Notice>;
  return (
    <div className="space-y-6">
      <section aria-labelledby="best">
        <h1 id="best" className="display text-5xl font-bold leading-[0.95] sm:text-7xl">
          Best cards
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Events ranked by card rating: the average of all their fight ratings.
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
