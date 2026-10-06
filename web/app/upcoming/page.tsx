import type { Metadata } from "next";
import { Notice } from "@/components/Notice";
import { UpcomingCard } from "@/components/UpcomingCard";
import { listUpcomingEvents } from "@/lib/data/upcoming";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Upcoming cards",
  description:
    "The announced fight cards, soonest first, with start times in your time zone and the fights to look out for. Pre-fight facts only.",
  path: "/upcoming",
  root: true,
});

export default async function UpcomingIndexPage() {
  const now = new Date();
  const events = await listUpcomingEvents(now);
  return (
    <div className="space-y-6">
      <section aria-labelledby="upcoming">
        <h1 id="upcoming" className="display text-5xl font-bold leading-[0.95] sm:text-7xl">
          Upcoming cards
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Announced cards, soonest first. Each fight gets an expected rating from what is public before the
          bout. Cards can still change before the event.
        </p>
      </section>
      {events.length === 0 ? (
        <Notice>No cards are announced yet. Check back soon.</Notice>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {events.map((event) => (
            <li key={event.id}>
              <UpcomingCard event={event} today={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
