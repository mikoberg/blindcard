import { formatPercent, formatPoints } from "@/lib/judges/format";
import {
  MIN_CARDS,
  compareRate,
  compareWidth,
  dotsFor,
} from "@/lib/judges/stats";
import type { BaselineRow, JudgeRow } from "@/lib/judges/types";
import { isNotable, rateSentence, widthSentence } from "@/lib/judges/words";
import { JudgeDotPlot } from "./JudgeDotPlot";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-t border-[var(--accent)]/30 pt-8"
    >
      <h2
        id={id}
        className="font-[family-name:var(--font-display)] text-2xl font-bold"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A comparison bar: this judge against all judges, same scale. */
function Bar({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-[var(--muted)]">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span
          className={`block h-full rounded-full ${accent ? "bg-[var(--accent)]" : "bg-[var(--muted)]/60"}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </span>
      <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
        {formatPoints(value)}
      </span>
    </div>
  );
}

/**
 * One judge, as totals over all their scorecards: no fight is named. The page says what the
 * numbers allow: most judges look alike, and only a difference too big to be luck gets a verdict.
 */
export function JudgeProfileView({
  judge,
  baseline,
  comparable,
}: {
  judge: JudgeRow;
  baseline: BaselineRow;
  comparable: readonly JudgeRow[];
}) {
  const years =
    judge.first_year === judge.last_year
      ? `${judge.first_year}`
      : `${judge.first_year} to ${judge.last_year}`;
  if (judge.cards < MIN_CARDS) {
    return (
      <div className="space-y-4">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.95] sm:text-6xl">
          {judge.name}
        </h1>
        <p className="max-w-xl text-lg text-[var(--muted)]">
          Not enough scorecards yet to compare this judge with the others. We
          need at least {MIN_CARDS}.
        </p>
      </div>
    );
  }

  const rate = compareRate(judge, baseline);
  const width = compareWidth(judge, baseline);
  const notable = [
    isNotable(rate.verdict) ? rateSentence(rate.verdict) : null,
    isNotable(width.verdict) ? widthSentence(width.verdict) : null,
  ].filter((line): line is string => line !== null);
  const widthMax = Math.max(
    3,
    Math.ceil(Math.max(width.mean, width.baseMean) * 2) / 2,
  );
  const lonePct = judge.lone_dissent / judge.cards;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.95] sm:text-6xl">
          {judge.name}
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          {judge.cards} scorecards, {years}
        </p>
        <p
          className={`mt-5 max-w-xl text-xl font-semibold ${notable.length > 0 ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
        >
          {notable.length > 0
            ? notable.join(" ")
            : "In line with the other judges."}
        </p>
        {notable.length === 0 && (
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Judges differ very little. A verdict only shows up when a difference
            is too big to be luck.
          </p>
        )}
      </header>

      <Section
        id="against"
        title="How often they score against the official result"
      >
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="font-[family-name:var(--font-display)] text-6xl font-bold tabular-nums text-[var(--accent)]">
            {formatPercent(rate.rate)}
          </span>
          <span className="text-[var(--muted)]">
            of {judge.cards} scorecards. All judges:{" "}
            {formatPercent(rate.baseRate)}. Likely range for this judge:{" "}
            {formatPercent(rate.low)} to {formatPercent(rate.high)}.
          </span>
        </p>
        <JudgeDotPlot
          dots={dotsFor(comparable)}
          slug={judge.slug}
          name={judge.name}
          rate={rate.rate}
          low={rate.low}
          high={rate.high}
          baseRate={rate.baseRate}
        />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Alone against both other judges in {judge.lone_dissent} scorecards (
          {formatPercent(lonePct)}).
        </p>
      </Section>

      <Section id="width" title="How wide they score">
        <div className="mt-4 space-y-3">
          <Bar label="This judge" value={width.mean} max={widthMax} accent />
          <Bar label="All judges" value={width.baseMean} max={widthMax} />
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Average points between the two fighters on a scorecard.
        </p>
        <p className="mt-2 text-[var(--muted)]">
          {widthSentence(width.verdict)}
        </p>
      </Section>

      <p className="max-w-xl border-t border-[var(--accent)]/30 pt-6 text-sm text-[var(--muted)]">
        Based on the {judge.cards} scorecards we have of this judge (fights that
        went to the judges with a clear result; draws are left out). Totals
        only: no fight is listed. With a few hundred scorecards, gaps of a point
        or two in a hundred are within chance.
      </p>
    </div>
  );
}
