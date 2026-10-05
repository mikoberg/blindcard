import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FighterProfileView } from "@/components/FighterProfileView";
import { isValidSlug } from "@/lib/data/events";
import { getFighterProfile } from "@/lib/data/leaderboard";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = isValidSlug(slug) ? await getFighterProfile(slug) : null;
  if (!profile) return { title: "Fighter not found" };
  return {
    title: profile.name,
    alternates: { canonical: `/fighters/${profile.slug}` },
  };
}

export default async function FighterPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const profile = await getFighterProfile(slug);
  if (!profile) notFound();
  return <FighterProfileView profile={profile} />;
}
