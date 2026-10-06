/**
 * A championship belt as a small label: a dark strap with gold studs, a large gold plate with a star
 * in the middle and a smaller plate on each side, all drawn here (no lettering, no promotion's mark).
 * It stands for "Title fight" wherever that label used to be; the words stay for screen readers and
 * as the tooltip. Draw it about 3.5 times as wide as it is high.
 */
const octagon = (cx: number, cy: number, halfW: number, halfH: number, cut: number): string => {
  const [l, r, t, b] = [cx - halfW, cx + halfW, cy - halfH, cy + halfH];
  return `M${l + cut} ${t}L${r - cut} ${t}L${r} ${t + cut}L${r} ${b - cut}L${r - cut} ${b}L${l + cut} ${b}L${l} ${b - cut}L${l} ${t + cut}z`;
};

const STUDS_LEFT = [9, 14.5, 20];
const STUDS_RIGHT = [92, 97.5, 103];
const STAR = (() => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 5.2 : 2.3;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(56 + r * Math.cos(angle)).toFixed(1)} ${(16 + r * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join("L")}z`;
})();

export function TitleBelt({
  className = "h-5 w-[70px]",
  caption = false,
}: {
  className?: string;
  /** Write "Title fight" in small gold type above the belt (then the words are not repeated for screen readers). */
  caption?: boolean;
}) {
  const ink = { fill: "var(--ink)" };
  const gold = { fill: "var(--gold-mid)" };
  const rim = { fill: "var(--gold-hi)" };
  return (
    <span className={`shrink-0 ${caption ? "inline-flex flex-col items-center gap-0.5" : "inline-flex"}`} title="Title fight">
      {caption && <span className="text-[0.68rem] font-extrabold leading-none text-[var(--gold-text)]">Title fight</span>}
      <svg viewBox="0 0 112 32" aria-hidden="true" className={className}>
        <rect x="0" y="9" width="112" height="14" rx="3" style={ink} />
        {[12.5, 19.5].flatMap((y) =>
          [...STUDS_LEFT, ...STUDS_RIGHT].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" style={gold} />),
        )}
        {[34, 78].map((x) => (
          <g key={x}>
            <path d={octagon(x, 16, 8, 8, 2.8)} style={rim} stroke="var(--ink)" strokeWidth="1" />
            <path d={octagon(x, 16, 5.2, 5.2, 1.8)} style={gold} />
          </g>
        ))}
        <path d={octagon(56, 16, 17, 14, 7)} style={rim} stroke="var(--ink)" strokeWidth="1.2" />
        <path d={octagon(56, 16, 13.5, 10.8, 5.2)} style={gold} stroke="var(--ink)" strokeWidth="0.8" />
        <path d={STAR} style={ink} />
      </svg>
      {!caption && <span className="sr-only">Title fight</span>}
    </span>
  );
}
