import type { MetadataRoute } from "next";
import { listEvents } from "@/lib/data/events";
import { listUpcomingEvents } from "@/lib/data/upcoming";
import { getSiteUrl } from "@/lib/site";

// Generated per request: one cheap query, and always up to date.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const [events, upcoming] = await Promise.all([listEvents(), listUpcomingEvents()]);
  return [
    { url: `${base}/` },
    { url: `${base}/best` },
    { url: `${base}/fighters` },
    { url: `${base}/classics` },
    { url: `${base}/about` },
    { url: `${base}/contact` },
    { url: `${base}/privacy` },
    ...upcoming.map((event) => ({ url: `${base}/upcoming/${event.slug}` })),
    ...events.map((event) => ({ url: `${base}/events/${event.slug}`, lastModified: event.eventDate })),
  ];
}
