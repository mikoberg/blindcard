import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { listEvents } from "@/lib/data/events";
import { formatEventDate, groupEventsByYear } from "@/lib/format";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "All events",
  description: "Every event with spoiler-free fight ratings.",
};

export default async function EventsPage() {
  const groups = groupEventsByYear(await listEvents());
  if (groups.length === 0) return <Notice>No events yet.</Notice>;
  return (
    <div className="space-y-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">All events</h1>
      {groups.map((group) => (
        <section key={group.year} aria-labelledby={`year-${group.year}`}>
          <h2 id={`year-${group.year}`} className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--accent)]">
            {group.year}
          </h2>
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {group.events.map((event) => (
              <li key={event.id}>
                <Link href={`/events/${event.slug}`} className="block px-4 py-3 hover:bg-[var(--surface-2)]">
                  <span className="block break-words font-semibold">{event.name}</span>
                  <span className="block text-sm text-[var(--muted)]">
                    {formatEventDate(event.eventDate)}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
