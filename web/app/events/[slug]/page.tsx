import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardView } from "@/components/CardView";
import { getCard } from "@/lib/data/card";
import { getEventBySlug, isValidSlug } from "@/lib/data/events";
import { formatEventDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site";
import { jsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = isValidSlug(slug) ? await getEventBySlug(slug) : null;
  if (!event) return { title: "Event not found" };
  return pageMetadata({
    title: event.name,
    description: `Which fights on ${event.name} (${formatEventDate(event.eventDate)}) are worth watching? A rating for every fight, and no results.`,
    path: `/events/${event.slug}`,
  });
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const fights = await getCard(event.id);
  // Structured data holds only what is public before a Reveal: name, date, place and address.
  const structured = jsonLd({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    startDate: event.eventDate,
    sport: "Mixed martial arts",
    url: `${getSiteUrl()}/events/${event.slug}`,
    ...(event.location ? { location: { "@type": "Place", name: event.location } } : {}),
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />
      <CardView event={event} fights={fights} />
    </>
  );
}
