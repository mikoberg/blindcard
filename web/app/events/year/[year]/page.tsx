import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/EventCard";
import { SortToggle } from "@/components/SortToggle";
import { YearNav } from "@/components/YearNav";
import { listEventSummaries } from "@/lib/data/overview";
import { summariesByYear } from "@/lib/overview/summary";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ year: string }> };

const YEAR = /^(19|20)\d{2}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  if (!YEAR.test(year)) return { title: "Year not found" };
  return pageMetadata({
    title: `Events of ${year}`,
    description: `Every event of ${year}, with a rating for each fight and no results.`,
    path: `/events/year/${year}`,
  });
}

export default async function YearPage({ params }: Props) {
  const { year } = await params;
  if (!YEAR.test(year)) notFound();
  const groups = summariesByYear(await listEventSummaries());
  const group = groups.find((candidate) => candidate.year === year);
  if (!group) notFound();
  return (
    <div className="space-y-6">
      <h1 className="page-title">{year}</h1>
      <p className="max-w-xl text-lg text-[var(--muted)]">
        {group.events.length === 1 ? "1 event" : `${group.events.length} events`}, newest first.
      </p>
      <SortToggle active="newest" />
      <YearNav years={groups.map((candidate) => candidate.year)} base="/events/year" current={year} sticky={false} />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {group.events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </div>
  );
}
