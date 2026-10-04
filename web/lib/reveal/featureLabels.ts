/** Plain-English names and value formats for the score features shown after a reveal. */

interface FeatureLabel {
  label: string;
  format: (raw: number) => string;
}

const perMinute = (unit: string) => (raw: number) => `${raw.toFixed(1)} ${unit} per min`;
const count = (raw: number) => String(Math.round(raw));
const yesNo = (raw: number) => (raw >= 0.5 ? "yes" : "no");
const percent = (raw: number) => `${Math.round(raw * 100)}%`;

const LABELS: Record<string, FeatureLabel> = {
  pace: { label: "Striking pace", format: perMinute("strikes") },
  min_pace: { label: "Pace of the quieter fighter", format: perMinute("strikes") },
  total_pace: { label: "Total strikes", format: perMinute("strikes") },
  takedown_rate: { label: "Takedowns", format: perMinute("takedowns") },
  knockdowns: { label: "Knockdowns", format: count },
  knockdowns_both: { label: "Knockdowns by both fighters", format: yesNo },
  sub_attempts: { label: "Submission attempts", format: count },
  reversals: { label: "Reversals", format: count },
  swings: { label: "Round-to-round lead changes", format: count },
  competitiveness: { label: "How even the striking was", format: percent },
  close_decision: { label: "Split or majority decision", format: yesNo },
  finish: { label: "Ended in a finish", format: yesNo },
  ko_finish: { label: "Ended by KO/TKO", format: yesNo },
  sub_finish: { label: "Ended by submission", format: yesNo },
  finish_lateness: { label: "How late the finish came", format: percent },
  early_finish: { label: "How early the finish came", format: percent },
  time_fraction: { label: "Share of the scheduled time used", format: percent },
  control_share: { label: "Time spent under control", format: percent },
  volume: { label: "Strikes landed over the whole fight", format: count },
  five_rounds: { label: "Scheduled for five rounds", format: yesNo },
  main_event: { label: "Main event", format: yesNo },
  co_main: { label: "Co-main event", format: yesNo },
  title_fight: { label: "Title fight", format: yesNo },
  rematch: { label: "Rematch", format: yesNo },
  streak: { label: "Win streaks of the two fighters", format: count },
  star_power: { label: "Earlier main events and title fights", format: count },
  unbeaten_fighter: { label: "An unbeaten fighter", format: yesNo },
  experience: { label: "UFC fights of the less experienced fighter", format: count },
  control_share_nofinish: { label: "Time under control without a finish", format: percent },
};

/** Unknown features (a future score version) fall back to their key, so nothing breaks. */
export function featureLabel(feature: string, raw: number): { label: string; value: string } {
  const known = LABELS[feature];
  if (known) return { label: known.label, value: known.format(raw) };
  return { label: feature.replaceAll("_", " "), value: String(Math.round(raw * 100) / 100) };
}
