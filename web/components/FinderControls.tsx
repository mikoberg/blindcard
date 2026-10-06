"use client";

import { useId, useState } from "react";
import { FLAGS, METRICS, SORTS, WEIGHT_CLASSES, isMetricId, metricById, type MetricGroup } from "@/lib/explore/metrics";
import { MAX_RULES, PRESETS, applyPreset, freshState, pillsOf, type FinderState, type Rule } from "@/lib/explore/query";

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

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.slice(0, 2).toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const SORT_GROUPS = ["Date", "Ratings", "Elo", "UFC ranks", "The card"] as const;
const METRIC_GROUPS: readonly MetricGroup[] = ["Ratings", "Elo", "UFC ranks", "The card"];

function RuleRow({ rule, onChange, onRemove }: { rule: Rule; onChange: (rule: Rule) => void; onRemove: () => void }) {
  const metric = metricById(rule.metric);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_9rem_7rem_auto]">
      <select
        aria-label="Condition on"
        className={`${FIELD} col-span-2 sm:col-span-1`}
        value={rule.metric}
        onChange={(e) => isMetricId(e.target.value) && onChange({ ...rule, metric: e.target.value })}
      >
        {METRIC_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {METRICS.filter((m) => m.group === group).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
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
 * The finder's bar: the order, a Filters button with the number of chosen filters, and under it the
 * chosen filters as pills. The fields themselves sit in a panel that stays closed until asked for, so
 * the cards start right under one line.
 */
export function FinderControls({
  state,
  onChange,
  years,
  countries,
  total,
}: {
  state: FinderState;
  onChange: (next: FinderState) => void;
  years: readonly number[];
  countries: readonly string[];
  total: number | null;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<FinderState>) => onChange({ ...state, ...patch });
  const toggle = <T extends string>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const names = new Map(countries.map((code) => [code, countryName(code)]));
  const sortedCountries = [...countries].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b));
  const pills = pillsOf(state, (code) => names.get(code) ?? countryName(code));
  const panelId = `${id}-panel`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-x-4 gap-y-3 border-2 border-[var(--text)] bg-[var(--surface)] p-2 sm:p-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:px-4">
          <label htmlFor={`${id}-sort`} className="shrink-0 text-sm font-bold text-[var(--muted)]">
            Order by
          </label>
          <select
            id={`${id}-sort`}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text)]"
            value={state.sort}
            onChange={(e) => set({ sort: e.target.value })}
          >
            {SORT_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {SORTS.filter((s) => s.group === group).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-11 items-center gap-2 px-4 text-sm font-bold transition-colors sm:border-l-2 sm:border-[var(--text)] ${
            open ? "bg-[var(--text)] text-[var(--bg)]" : "hover:bg-[var(--surface-2)]"
          }`}
        >
          Filters
          {pills.length > 0 && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs ${
                open ? "bg-[var(--bg)] text-[var(--text)]" : "bg-[var(--text)] text-[var(--bg)]"
              }`}
            >
              {pills.length}
              <span className="sr-only"> chosen</span>
            </span>
          )}
          <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
      </div>

      {pills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Chosen filters" role="group">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => onChange(pill.remove(state))}
              className="inline-flex min-h-8 items-center gap-2 border-2 border-[var(--text)] bg-[var(--surface)] px-2.5 text-sm font-bold hover:bg-[var(--surface-2)]"
            >
              {pill.label}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(freshState({ sort: state.sort }))}
            className="min-h-8 px-1 text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[var(--accent)]"
          >
            Clear filters
          </button>
          {total !== null && (
            <span className="ml-auto text-sm font-bold">
              {total} {total === 1 ? "card" : "cards"}
            </span>
          )}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
          <span>Try</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(applyPreset(preset))}
              className="font-bold text-[var(--text)] underline decoration-2 underline-offset-4 hover:text-[var(--accent)]"
            >
              {preset.label}
            </button>
          ))}
          {total !== null && <span className="ml-auto font-bold text-[var(--text)]">{total} cards</span>}
        </p>
      )}

      {open && (
        <div id={panelId} className="space-y-5 border-2 border-[var(--text)] bg-[var(--surface)] p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div>
              <label className={LABEL} htmlFor={`${id}-kind`}>
                Kind of event
              </label>
              <select
                id={`${id}-kind`}
                className={FIELD}
                value={state.kind}
                onChange={(e) =>
                  set({ kind: e.target.value === "numbered" || e.target.value === "nights" ? e.target.value : "all" })
                }
              >
                <option value="all">All events</option>
                <option value="numbered">Numbered events</option>
                <option value="nights">Fight Nights</option>
              </select>
            </div>
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
                <Chip
                  key={wc}
                  on={state.weightClasses.includes(wc)}
                  onClick={() => set({ weightClasses: toggle(state.weightClasses, wc) })}
                >
                  {wc}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Conditions</legend>
            {state.rules.length > 0 && (
              <ul className="mb-3 space-y-2">
                {state.rules.map((rule, index) => (
                  <RuleRow
                    key={index}
                    rule={rule}
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
      )}
    </div>
  );
}
