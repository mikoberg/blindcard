import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpcomingView } from "@/components/UpcomingView";
import { getUpcomingEvent } from "@/lib/data/upcoming";
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
  return { title: `${event.name} (upcoming)`, alternates: { canonical: `/upcoming/${event.slug}` } };
}

export default async function UpcomingPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const now = new Date();
  const event = await getUpcomingEvent(slug, now);
  if (!event) notFound();
  return <UpcomingView event={event} today={now} />;
}
