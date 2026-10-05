import type { Metadata } from "next";
import { EventCard } from "@/components/EventCard";
import { Notice } from "@/components/Notice";
import { SortToggle } from "@/components/SortToggle";
import { YearNav } from "@/components/YearNav";
import { listEventSummaries } from "@/lib/data/overview";
import { summariesByYear } from "@/lib/overview/summary";

export const revalidate = 300;

export const metadata: Metadata = {
  // A layout title.template does not apply to the page in the same (root) segment.
  title: { absolute: "Blindcard – All events" },
  alternates: { canonical: "/" },
};

/** Events shown under the featured one, before the full list. */
const LATEST = 6;

export default async function HomePage() {
  const events = await listEventSummaries();
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
        </div>
        {newest && (
          <div>
            <EventCard event={newest} featured />
          </div>
        )}
      </section>

      <section aria-labelledby="latest">
        <h2 id="latest" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
          Latest events
        </h2>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.slice(0, LATEST).map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      </section>

      <div>
        <h2 className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">All events</h2>
        <div className="mt-4 mb-2">
          <SortToggle active="newest" />
        </div>
        <YearNav years={years.map((group) => group.year)} />
        {years.map((group) => (
          <section
            key={group.year}
            id={`year-${group.year}`}
            aria-labelledby={`heading-${group.year}`}
            className="scroll-mt-16 pt-10"
          >
            <h2
              id={`heading-${group.year}`}
              className="display flex items-center gap-4 text-5xl leading-none sm:text-6xl"
            >
              {group.year}
              <span aria-hidden="true" className="h-[3px] flex-1 bg-[var(--text)]" />
            </h2>
            <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
