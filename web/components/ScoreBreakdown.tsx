import type { AxisView, FactorView, ScoreView } from "@/lib/reveal/format";
import { StarRating } from "./StarRating";

function FactorList({ title, factors, tone }: { title: string; factors: FactorView[]; tone: "up" | "down" }) {
  if (factors.length === 0) return null;
  const bar = tone === "up" ? "bg-[var(--accent)]" : "bg-[var(--muted)]";
  return (
    <div className="mt-2">
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-1 space-y-2">
        {factors.map((factor) => (
          <li key={factor.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words">
                {factor.label} <span className="text-[var(--muted)]">({factor.value})</span>
              </span>
              <span className="shrink-0 tabular-nums">{factor.amount}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-2)]" aria-hidden="true">
              <div
                className={`h-full rounded-full ${bar}`}
                style={{ width: `${Math.max(4, Math.round(factor.share * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Axis({ axis }: { axis: AxisView }) {
  return (
    <>
      <FactorList title="What helped" factors={axis.up} tone="up" />
      <FactorList title="What held it back" factors={axis.down} tone="down" />
      {axis.up.length === 0 && axis.down.length === 0 && (
        <p className="mt-2 text-sm text-[var(--muted)]">No single factor stood out.</p>
      )}
    </>
  );
}

/**
 * "Why this rating". Only rendered after a reveal: the factors (finish, duration, pace) are
 * results in disguise, so they never appear on the public card.
 */
export function ScoreBreakdown({ score }: { score: ScoreView }) {
  return (
    <section className="mt-4 border-t border-[var(--border)] pt-4" aria-label="Why this rating">
      <h3 className="display text-base font-bold">Why this rating</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        The stars on the card rate how worth watching the fight is. Each line shows what it
        added or took away.
      </p>
      <Axis axis={score.fight} />
      {score.performance && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <h3 className="display text-base font-bold">Performance</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            How dominant the performance was. This one is only shown after a reveal, because it
            gives away how the fight ended.
          </p>
          <div className="mt-2">
            <StarRating stars={score.performance.stars} />
          </div>
          <Axis axis={score.performance} />
        </div>
      )}
    </section>
  );
}
