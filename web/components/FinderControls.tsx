"use client";

import { useId, useState } from "react";
import {
  FLAGS,
  METRICS,
  SORTS,
  WEIGHT_CLASSES,
  isMetricId,
  metricById,
  sortIsSpoiler,
  type MetricGroup,
} from "@/lib/explore/metrics";
import { DEFAULT_STATE, MAX_RULES, type FinderState, type Rule } from "@/lib/explore/query";

const FIELD =
  "min-h-11 w-full border-2 border-[var(--text)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--text)]";
const LABEL = "mb-1 block text-xs font-bold text-[var(--muted)]";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 border-2 border-[var(--text)] px-3 text-sm font-bold transition-colors ${
        on ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.slice(0, 2).toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const GROUPS: readonly MetricGroup[] = ["Ratings", "Elo", "UFC ranks", "The card"];

/** The metric picker of one condition: public metrics first, then the locked spoiler ones. */
function MetricSelect({
  value,
  unlocked,
  onChange,
  label,
}: {
  value: string;
  unlocked: boolean;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <select aria-label={label} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
      {GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {METRICS.filter((m) => m.group === group).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
      <optgroup label={unlocked ? "How the fights ended (spoilers)" : "How the fights ended (locked)"}>
        {METRICS.filter((m) => m.spoiler).map((m) => (
          <option key={m.id} value={m.id} disabled={!unlocked}>
            {m.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function RuleRow({
  rule,
  unlocked,
  onChange,
  onRemove,
}: {
  rule: Rule;
  unlocked: boolean;
  onChange: (rule: Rule) => void;
  onRemove: () => void;
}) {
  const metric = metricById(rule.metric);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_9rem_7rem_auto]">
      <div className="col-span-2 sm:col-span-1">
        <MetricSelect
          label="Condition on"
          value={rule.metric}
          unlocked={unlocked}
          onChange={(id) => isMetricId(id) && onChange({ ...rule, metric: id })}
        />
      </div>
      <select
        aria-label="At least or at most"
        className={FIELD}
        value={rule.op}
        onChange={(e) => onChange({ ...rule, op: e.target.value === "max" ? "max" : "min" })}
      >
        <option value="min">at least</option>
        <option value="max">at most</option>
      </select>
      <input
        aria-label="Value"
        type="number"
        inputMode="decimal"
        step={metric?.step ?? 1}
        className={FIELD}
        value={Number.isFinite(rule.value) ? rule.value : ""}
        onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? NaN : Number(e.target.value) })}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this condition"
        className="min-h-11 min-w-11 border-2 border-[var(--text)] text-lg font-bold hover:bg-[var(--surface-2)]"
      >
        ×
      </button>
    </li>
  );
}

/**
 * The form of the card finder. Everything here only changes the state; the list below it does the
 * work. Options that need result data are listed but cannot be picked until they are unlocked.
 */
export function FinderControls({
  state,
  onChange,
  unlocked,
  years,
  countries,
}: {
  state: FinderState;
  onChange: (next: FinderState) => void;
  unlocked: boolean;
  years: readonly number[];
  countries: readonly string[];
}) {
  const id = useId();
  const extras =
    state.flags.length + state.weightClasses.length + state.rules.length > 0 || state.country !== null || state.place !== "";
  // Open by itself while something in it is chosen (a link, a quick start); the visitor can still fold it.
  const [folded, setFolded] = useState<boolean | null>(null);
  const open = folded === null ? extras : !folded;
  const set = (patch: Partial<FinderState>) => onChange({ ...state, ...patch });
  const toggle = <T extends string>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const names = new Map(countries.map((code) => [code, countryName(code)]));
  const sortedCountries = [...countries].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <label className={LABEL} htmlFor={`${id}-sort`}>
            Order by
          </label>
          <select
            id={`${id}-sort`}
            className={FIELD}
            value={state.sort}
            onChange={(e) => set({ sort: e.target.value })}
          >
            <optgroup label="Spoiler-free">
              {SORTS.filter((s) => !sortIsSpoiler(s)).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={unlocked ? "Spoilers" : "Spoilers (locked)"}>
              {SORTS.filter((s) => sortIsSpoiler(s)).map((s) => (
                <option key={s.id} value={s.id} disabled={!unlocked}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <div>
            <label className={LABEL} htmlFor={`${id}-from`}>
              From year
            </label>
            <select
              id={`${id}-from`}
              className={FIELD}
              value={state.fromYear ?? ""}
              onChange={(e) => set({ fromYear: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Any</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor={`${id}-to`}>
              To year
            </label>
            <select
              id={`${id}-to`}
              className={FIELD}
              value={state.toYear ?? ""}
              onChange={(e) => set({ toYear: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Any</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor={`${id}-kind`}>
            Kind of event
          </label>
          <select
            id={`${id}-kind`}
            className={FIELD}
            value={state.kind}
            onChange={(e) => set({ kind: e.target.value === "numbered" || e.target.value === "nights" ? e.target.value : "all" })}
          >
            <option value="all">All events</option>
            <option value="numbered">Numbered events</option>
            <option value="nights">Fight Nights</option>
          </select>
        </div>
      </div>

      <details
        className="group border-2 border-[var(--text)] bg-[var(--surface)]"
        open={open}
        onToggle={(e) => setFolded(!e.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold">
          More filters
          <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="space-y-5 border-t-2 border-[var(--text)] p-4">
          <fieldset>
            <legend className={LABEL}>The card has</legend>
            <div className="flex flex-wrap gap-2">
              {FLAGS.map((flag) => (
                <Chip key={flag.id} on={state.flags.includes(flag.id)} onClick={() => set({ flags: toggle(state.flags, flag.id) })}>
                  {flag.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Includes a fight at</legend>
            <div className="flex flex-wrap gap-2">
              {WEIGHT_CLASSES.map((wc) => (
                <Chip key={wc} on={state.weightClasses.includes(wc)} onClick={() => set({ weightClasses: toggle(state.weightClasses, wc) })}>
                  {wc}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor={`${id}-country`}>
                Has a fighter from
              </label>
              <select
                id={`${id}-country`}
                className={FIELD}
                value={state.country ?? ""}
                onChange={(e) => set({ country: e.target.value === "" ? null : e.target.value })}
              >
                <option value="">Anywhere</option>
                {sortedCountries.map((code) => (
                  <option key={code} value={code}>
                    {names.get(code)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor={`${id}-place`}>
                Place contains
              </label>
              <input
                id={`${id}-place`}
                type="search"
                maxLength={60}
                placeholder="Las Vegas, Abu Dhabi, Rio…"
                className={FIELD}
                value={state.place}
                onChange={(e) => set({ place: e.target.value })}
              />
            </div>
          </div>

          <fieldset>
            <legend className={LABEL}>Conditions</legend>
            {state.rules.length > 0 && (
              <ul className="mb-3 space-y-2">
                {state.rules.map((rule, index) => (
                  <RuleRow
                    key={index}
                    rule={rule}
                    unlocked={unlocked}
                    onChange={(next) => set({ rules: state.rules.map((r, i) => (i === index ? next : r)) })}
                    onRemove={() => set({ rules: state.rules.filter((_, i) => i !== index) })}
                  />
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={state.rules.length >= MAX_RULES}
              onClick={() => set({ rules: [...state.rules, { metric: "eloAvg", op: "min", value: 1600 }] })}
              className="min-h-10 border-2 border-dashed border-[var(--text)] px-4 text-sm font-bold hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              + Add a condition
            </button>
            <p className="mt-2 text-xs text-[var(--muted)]">
              For example: average Elo at least 1600, or at most 2 rematches. Up to {MAX_RULES}.
            </p>
          </fieldset>
        </div>
      </details>

      <div>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [] })}
          className="min-h-10 text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[var(--accent)]"
        >
          Reset everything
        </button>
      </div>
    </div>
  );
}
