import type { Metadata } from "next";
import { CardView } from "@/components/CardView";
import { Notice } from "@/components/Notice";
import { getCard } from "@/lib/data/card";
import { getLatestEventWithFights } from "@/lib/data/events";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const event = await getLatestEventWithFights();
  if (!event) return {};
  return {
    // A layout title.template does not apply to the page in the same (root) segment.
    title: { absolute: `Blindcard – ${event.name}` },
    alternates: { canonical: `/events/${event.slug}` },
  };
}

export default async function HomePage() {
  const event = await getLatestEventWithFights();
  if (!event) return <Notice>No events yet. Check back soon.</Notice>;
  const fights = await getCard(event.id);
  return <CardView event={event} fights={fights} />;
}
