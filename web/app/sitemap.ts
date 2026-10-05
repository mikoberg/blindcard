import type { MetadataRoute } from "next";
import { listEvents } from "@/lib/data/events";
import { listUpcomingEvents } from "@/lib/data/upcoming";
import { summariesByYear } from "@/lib/overview/summary";
import { getSiteUrl } from "@/lib/site";

// Rebuilt at most once an hour: crawlers ask often, and the data changes once or twice a day.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const [events, upcoming] = await Promise.all([listEvents(), listUpcomingEvents()]);
  const years = summariesByYear(
    events.map((event) => ({ ...event, mainEvent: null, ratings: [] })),
  ).map((group) => ({ url: `${base}/events/year/${group.year}`, lastModified: group.events[0]?.eventDate }));
  return [
    { url: `${base}/` },
    { url: `${base}/best` },
    { url: `${base}/fighters` },
    { url: `${base}/classics` },
    { url: `${base}/about` },
    { url: `${base}/contact` },
    { url: `${base}/privacy` },
    ...years,
    ...upcoming.map((event) => ({ url: `${base}/upcoming/${event.slug}` })),
    ...events.map((event) => ({ url: `${base}/events/${event.slug}`, lastModified: event.eventDate })),
  ];
}
