import type { Metadata } from "next";
import { ClassicSeal } from "@/components/ClassicSeal";
import { ClassicsList } from "@/components/ClassicsList";
import { Notice } from "@/components/Notice";
import { classicsByYear, toClassics } from "@/lib/classics/group";
import { listClassicRows, listFightVideos } from "@/lib/data/classics";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Blindcard – The classics" },
  alternates: { canonical: "/classics" },
};

export default async function ClassicsPage() {
  const [rows, videos] = await Promise.all([listClassicRows(), listFightVideos()]);
  const classics = toClassics(rows, videos);
  if (classics.length === 0) return <Notice>No five-star fights yet. Check back soon.</Notice>;
  return (
    <div className="space-y-2">
      <section aria-labelledby="classics" className="flex items-start justify-between gap-6">
        <div>
          <h1
            id="classics"
            className="display text-5xl font-bold leading-[0.95] sm:text-7xl"
          >
            The classics
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
            Every fight rated 5.0: the top 1.5% of all fights, {classics.length} so far, newest first.
            Results stay hidden until you reveal them on the card.
          </p>
        </div>
        <ClassicSeal size="lg" />
      </section>
      <ClassicsList years={classicsByYear(classics)} />
    </div>
  );
}
