import type { Metadata } from "next";
import { CardFinder } from "@/components/CardFinder";
import { EventCard } from "@/components/EventCard";
import { Notice } from "@/components/Notice";
import { SiteSearch } from "@/components/SiteSearch";
import { SortToggle } from "@/components/SortToggle";
import { UpcomingSection } from "@/components/UpcomingSection";
import { YearNav } from "@/components/YearNav";
import { formatEventDate } from "@/lib/format";
import { listEventSummaries } from "@/lib/data/overview";
import { listUpcomingEvents } from "@/lib/data/upcoming";
import { summariesByYear } from "@/lib/overview/summary";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "All events",
  description:
    "Which fights are worth watching? A rating for every fight on every card, newest first, with the announced cards ahead. Results stay sealed until you reveal them.",
  path: "/",
  root: true,
});

/** Events shown under the featured one, before the full list. */
const LATEST = 12;

export default async function HomePage() {
  const now = new Date();
  const [events, upcoming] = await Promise.all([listEventSummaries(), listUpcomingEvents(now)]);
  if (events.length === 0) return <Notice>No events yet. Check back soon.</Notice>;
  const years = summariesByYear(events);
  const [newest, ...rest] = events;
  return (
    <div className="space-y-14">
      <section
        aria-labelledby="intro"
        className="grid items-center gap-8 pt-4 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-10"
      >
        <div>
          <h1 id="intro" className="page-title">
            Which fights are worth watching?
          </h1>
          <p className="mt-6 max-w-md text-lg leading-snug">
            Every fight gets a rating. Results stay sealed until you reveal them yourself.
          </p>
          <div className="mt-8">
            <SiteSearch />
          </div>
        </div>
        {newest && (
          <div>
            <EventCard event={newest} featured />
          </div>
        )}
      </section>

      <UpcomingSection events={upcoming} today={now} />

      <section aria-labelledby="latest">
        <h2 id="latest" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
          Latest events
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The newest card here took place on {formatEventDate(newest.eventDate)}. New cards appear the day after an
          event.
        </p>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.slice(0, LATEST).map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="find" className="space-y-5">
        <h2 id="find" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
          Find a card
        </h2>
        <p className="max-w-2xl text-[var(--muted)]">
          Order every card by what you care about: ratings, Elo, ranked fighters, title fights, places.
        </p>
        <CardFinder />
      </section>

      <section aria-labelledby="browse" className="space-y-4">
        <h2 id="browse" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
          Browse by year
        </h2>
        <SortToggle active="newest" />
        <YearNav years={years.map((group) => group.year)} base="/events/year" sticky={false} />
      </section>
    </div>
  );
}
