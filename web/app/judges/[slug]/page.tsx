import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { JudgeProfileView } from "@/components/JudgeProfileView";
import { getBaseline, getJudge, listComparableJudges } from "@/lib/data/judges";
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
  const judge = isValidSlug(slug) ? await getJudge(slug) : null;
  if (!judge) return { title: "Judge not found" };
  // Statistics about a named person: reachable by link, kept out of search results.
  return pageMetadata({
    title: `${judge.name}, judge`,
    description: `Scorecard statistics of ${judge.name}: a summary of public scorecards, not a rating of the judge.`,
    path: `/judges/${judge.slug}`,
    noindex: true,
  });
}

export default async function JudgePage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const judge = await getJudge(slug);
  if (!judge) notFound();
  if (judge.slug !== slug) permanentRedirect(`/judges/${judge.slug}`);
  const [baseline, comparable] = await Promise.all([getBaseline(), listComparableJudges()]);
  if (!baseline) notFound();
  return <JudgeProfileView judge={judge} baseline={baseline} comparable={comparable} />;
}
