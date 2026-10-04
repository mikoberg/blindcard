import type { MetadataRoute } from "next";
import { listEvents } from "@/lib/data/events";
import { getSiteUrl } from "@/lib/site";

// Generated per request: one cheap query, and always up to date.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const events = await listEvents();
  return [
    { url: `${base}/` },
    ...events.map((event) => ({ url: `${base}/events/${event.slug}`, lastModified: event.eventDate })),
  ];
}
