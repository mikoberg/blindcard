import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UpcomingView } from "@/components/UpcomingView";
import { getEventBySlug } from "@/lib/data/events";
import { getUpcomingEvent } from "@/lib/data/upcoming";
import { formatEventDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { isValidSlug } from "@/lib/slug";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = isValidSlug(slug) ? await getUpcomingEvent(slug) : null;
  if (!event) return { title: "Event not found" };
  return pageMetadata({
    title: `${event.name} (upcoming)`,
    description: `The announced card of ${event.name} on ${formatEventDate(event.eventDate)}, with an expected rating for each fight.`,
    path: `/upcoming/${event.slug}`,
  });
}

export default async function UpcomingPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const now = new Date();
  const event = await getUpcomingEvent(slug, now);
  if (!event) {
    // The event has taken place and its card has been rated: send old links to the real page.
    const done = await getEventBySlug(slug);
    if (done) redirect(`/events/${done.slug}`);
    notFound();
  }
  return <UpcomingView event={event} today={now} />;
}
