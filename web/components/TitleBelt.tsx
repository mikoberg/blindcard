/**
 * A championship belt that doubles as the label: a dark strap with gold studs, a small plate on each
 * side and a large gold plate in the middle with "Title fight" engraved on it in ink. All drawn here
 * (no promotion's mark). The words are part of the picture, so it needs no caption. Draw it about
 * 4.25 times as wide as it is high.
 */
const octagon = (cx: number, cy: number, halfW: number, halfH: number, cut: number): string => {
  const [l, r, t, b] = [cx - halfW, cx + halfW, cy - halfH, cy + halfH];
  return `M${l + cut} ${t}L${r - cut} ${t}L${r} ${t + cut}L${r} ${b - cut}L${r - cut} ${b}L${l + cut} ${b}L${l} ${b - cut}L${l} ${t + cut}z`;
};

const STUDS = [4, 8.5, 127.5, 132];

export function TitleBelt({ className = "h-8 w-[136px]" }: { className?: string }) {
  const ink = { fill: "var(--ink)" };
  const gold = { fill: "var(--gold-mid)" };
  const rim = { fill: "var(--gold-hi)" };
  return (
    <svg viewBox="0 0 136 32" role="img" aria-label="Title fight" className={`shrink-0 ${className}`}>
      <title>Title fight</title>
      <rect x="0" y="10" width="136" height="12" rx="3" style={ink} />
      {[13.5, 18.5].flatMap((y) => STUDS.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" style={gold} />))}
      {[23, 113].map((x) => (
        <g key={x}>
          <path d={octagon(x, 16, 8, 8, 2.8)} style={rim} stroke="var(--ink)" strokeWidth="1" />
          <path d={octagon(x, 16, 5, 5, 1.8)} style={gold} />
        </g>
      ))}
      <path d={octagon(68, 16, 34, 15, 8)} style={rim} stroke="var(--ink)" strokeWidth="1.2" />
      <path d={octagon(68, 16, 30.5, 12, 6)} style={gold} stroke="var(--ink)" strokeWidth="0.8" />
      <text
        x="68"
        y="19.6"
        textAnchor="middle"
        fontSize="9.6"
        fontWeight="800"
        letterSpacing="0.1"
        style={{ fill: "var(--ink)", fontFamily: "inherit" }}
      >
        Title fight
      </text>
    </svg>
  );
}
