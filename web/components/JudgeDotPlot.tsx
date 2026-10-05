import { formatPercent } from "@/lib/judges/format";
import type { Dot } from "@/lib/judges/stats";

const W = 600;
const H = 190;
const PAD = 28;
const AXIS_Y = 140;

/**
 * Every judge with enough scorecards as a dot on one line (how often they scored against the
 * official result), the chosen judge as a gold dot with the likely range around it, and the
 * average of all judges as a dashed line. The point of the picture: most dots sit in the same
 * crowd. The other dots link to their judges.
 */
export function JudgeDotPlot({
  dots,
  slug,
  name,
  rate,
  low,
  high,
  baseRate,
}: {
  dots: readonly Dot[];
  slug: string;
  name: string;
  rate: number;
  low: number;
  high: number;
  baseRate: number;
}) {
  const max = Math.max(
    0.16,
    Math.ceil(Math.max(rate, high, ...dots.map((d) => d.rate)) * 40) / 40,
  );
  const x = (value: number) => PAD + (value / max) * (W - 2 * PAD);
  const ticks = Array.from(
    { length: Math.floor(max / 0.04 + 1e-9) + 1 },
    (_, i) => i * 0.04,
  );
  const others = dots.filter((d) => d.slug !== slug);
  const label = `${name}: ${formatPercent(rate)} of scorecards went against the official result; the average of all judges is ${formatPercent(baseRate)}. ${others.length + 1} judges are shown.`;
  return (
    <figure className="mt-5 max-w-2xl">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="w-full"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={AXIS_Y}
          y2={AXIS_Y}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={AXIS_Y}
              y2={AXIS_Y + 6}
              stroke="var(--border)"
            />
            <text
              x={x(t)}
              y={AXIS_Y + 26}
              textAnchor="middle"
              fontSize="17"
              fill="var(--muted)"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line
          x1={x(baseRate)}
          x2={x(baseRate)}
          y1={34}
          y2={AXIS_Y}
          stroke="var(--muted)"
          strokeDasharray="4 4"
        />
        <text
          x={x(baseRate)}
          y={22}
          textAnchor="middle"
          fontSize="17"
          fill="var(--muted)"
        >
          all judges {formatPercent(baseRate)}
        </text>
        {others.map((d, index) => (
          <a key={d.slug} href={`/judges/${d.slug}`}>
            <title>{`${d.name}: ${formatPercent(d.rate)}`}</title>
            <circle
              cx={x(d.rate)}
              cy={AXIS_Y - 16 - (index % 4) * 15}
              r="6"
              fill="var(--muted)"
              opacity="0.55"
            />
          </a>
        ))}
        <line
          x1={x(low)}
          x2={x(high)}
          y1={AXIS_Y - 16}
          y2={AXIS_Y - 16}
          stroke="var(--accent)"
          strokeWidth="13"
          strokeLinecap="round"
          opacity="0.28"
        />
        <circle cx={x(rate)} cy={AXIS_Y - 16} r="11" fill="var(--accent)" />
        <circle
          cx={x(rate)}
          cy={AXIS_Y - 16}
          r="16"
          fill="none"
          stroke="var(--accent)"
          opacity="0.5"
        />
      </svg>
      <figcaption className="text-sm text-[var(--muted)]">
        Each dot is a judge with at least 30 scorecards. The gold band is the
        likely range for this judge.
      </figcaption>
    </figure>
  );
}
