import type { Metadata } from "next";
import { EventCard } from "@/components/EventCard";
import { Notice } from "@/components/Notice";
import { YearNav } from "@/components/YearNav";
import { listEventSummaries } from "@/lib/data/overview";
import { summariesByYear } from "@/lib/overview/summary";

export const revalidate = 300;

export const metadata: Metadata = {
  // A layout title.template does not apply to the page in the same (root) segment.
  title: { absolute: "Blindcard – All events" },
  alternates: { canonical: "/" },
};

const FEATURED = 6;

export default async function HomePage() {
  const events = await listEventSummaries();
  if (events.length === 0) return <Notice>No events yet. Check back soon.</Notice>;
  const years = summariesByYear(events);
  return (
    <div className="space-y-10">
      <section aria-labelledby="intro">
        <h1
          id="intro"
          className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.95] sm:text-7xl"
        >
          Which fights are worth watching?
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Every fight gets a rating. Results stay hidden until you reveal them yourself.
        </p>
      </section>

      <section aria-labelledby="latest">
        <h2 id="latest" className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Latest events
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.slice(0, FEATURED).map((event) => (
            <li key={event.id}>
              <EventCard event={event} featured />
            </li>
          ))}
        </ul>
      </section>

      <div>
        <YearNav years={years.map((group) => group.year)} />
        {years.map((group) => (
          <section
            key={group.year}
            id={`year-${group.year}`}
            aria-labelledby={`heading-${group.year}`}
            className="lazy-section scroll-mt-16 pt-8"
          >
            <h2
              id={`heading-${group.year}`}
              className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--accent)]"
            >
              {group.year}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.events.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
