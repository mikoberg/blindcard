import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardView } from "@/components/CardView";
import { getCard } from "@/lib/data/card";
import { getEventBySlug, isValidSlug } from "@/lib/data/events";

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
  return {
    title: event.name,
    description: `Which fights on ${event.name} are worth watching? Ratings without spoilers.`,
    alternates: { canonical: `/events/${event.slug}` },
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const fights = await getCard(event.id);
  return <CardView event={event} fights={fights} />;
}
