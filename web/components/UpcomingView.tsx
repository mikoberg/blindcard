import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { eventLabel } from "@/lib/overview/matchup";
import {
  basisSentence,
  formatAmount,
} from "@/lib/upcoming/prediction";
import type { UpcomingBout, UpcomingEvent, UpcomingSegment } from "@/lib/upcoming/types";
import { countdownLabel, daysUntil } from "@/lib/upcoming/when";
import { ExpectedPlate } from "./ExpectedPlate";
import { headliners } from "./UpcomingCard";
import { UpcomingPick } from "./UpcomingPick";
import { Monogram } from "./Monogram";
import { Notice } from "./Notice";

const SEGMENT_ORDER: readonly UpcomingSegment[] = ["main", "prelim", "early_prelim"];
const SEGMENT_LABELS: Record<UpcomingSegment, string> = {
  main: "Main card",
  prelim: "Prelims",
  early_prelim: "Early prelims",
};
const TAG = "inline-flex items-center border-2 px-2 py-0.5 text-xs font-bold";
/** Plate width plus the gap next to it: the divider reaches back under the plate. */
const PLATE_REACH = "-ml-[5.25rem]";

/** The card split by part when every bout has one (all or nothing, as on completed cards). */
function groups(bouts: readonly UpcomingBout[]): { label: string | null; bouts: UpcomingBout[] }[] {
  if (bouts.length === 0) return [];
  if (bouts.some((b) => b.segment === null)) return [{ label: null, bouts: [...bouts] }];
  return SEGMENT_ORDER.map((segment) => ({
    label: SEGMENT_LABELS[segment],
    bouts: bouts.filter((b) => b.segment === segment),
  })).filter((g) => g.bouts.length > 0);
}

function FighterName({ fighter }: { fighter: UpcomingBout["a"] }) {
  const name = <span className="block break-words text-xl font-bold leading-tight sm:text-2xl">{fighter.name}</span>;
  return (
    <span className="flex items-center gap-3">
      <Monogram name={fighter.name} country={fighter.country} size="lg" />
      <span className="min-w-0 flex-1">
        {fighter.slug ? (
          <Link href={`/fighters/${fighter.slug}`} className="hover:text-[var(--accent)]">
            {name}
          </Link>
        ) : (
          name
        )}
      </span>
    </span>
  );
}

/** "How we got this": what moved the expectation, in stars, and how much history it rests on. */
function Why({ bout }: { bout: UpcomingBout }) {
  const prediction = bout.prediction;
  if (!prediction) return null;
  const largest = Math.max(0.3, ...prediction.why.map((r) => Math.abs(r.amount)));
  return (
    <details className="group mt-4 border-t-2 border-[var(--border)] pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4">
        How we got this
      </summary>
      <p className="mt-2 text-sm text-[var(--muted)]">{basisSentence(prediction.basis)}</p>
      {prediction.why.length > 0 && (
        <ul className="mt-3 space-y-2">
          {prediction.why.map((reason) => (
            <li key={reason.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span>{reason.label}</span>
                <span className="shrink-0 tabular-nums">{formatAmount(reason.amount)} stars</span>
              </div>
              <div className="mt-1 h-1.5 bg-[var(--border)]" aria-hidden="true">
                <div
                  className={`h-full ${reason.amount >= 0 ? "bg-[var(--accent)]" : "bg-[var(--muted)]"}`}
                  style={{ width: `${Math.max(6, Math.round((Math.abs(reason.amount) / largest) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--muted)]">
        Each line shows what it adds to or takes off an average fight. The fight itself can still land well
        above or below this.
      </p>
    </details>
  );
}

/** One announced bout: names, weight class and the expected rating. No record, streak or result. */
function UpcomingBoutCard({ bout }: { bout: UpcomingBout }) {
  const plated = bout.prediction !== null;
  return (
    <li className="border-2 border-[var(--text)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex gap-4">
        {bout.prediction && <ExpectedPlate stars={bout.prediction.stars} />}
        <div className="min-w-0 flex-1">
          {(plated || bout.position === 1 || bout.isTitleFight) && (
            <div className="mb-3 flex min-h-7 flex-wrap items-center gap-2">
              {bout.position === 1 && (
                <span className={`${TAG} border-[var(--text)] bg-[var(--text)] text-[var(--bg)]`}>Main event</span>
              )}
              {bout.isTitleFight && (
                <span className={`${TAG} border-[var(--accent)] text-[var(--accent)]`}>Title fight</span>
              )}
            </div>
          )}
          <h3>
            <FighterName fighter={bout.a} />
            <span className={`${plated ? PLATE_REACH : ""} my-3 flex items-center gap-3`}>
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="display-tight flex items-baseline gap-2 bg-[var(--surface-2)] px-3 py-1 text-base leading-none sm:text-lg">
                <span className="text-sm font-bold text-[var(--accent)]">vs</span>
                {bout.weightClass && <span aria-hidden="true">{bout.weightClass}</span>}
              </span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </span>
            <FighterName fighter={bout.b} />
          </h3>
          {bout.weightClass && <p className="sr-only">{bout.weightClass} bout</p>}
        </div>
      </div>
      <Why bout={bout} />
      {bout.hasPick && <UpcomingPick boutId={bout.id} nameA={bout.a.name} nameB={bout.b.name} />}
    </li>
  );
}

/** Says what the expected ratings are, how they were tested and what they cannot tell you. */
function About() {
  return (
    <details className="border-2 border-dashed border-[var(--muted)] bg-[var(--surface)] px-4 py-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold">
        About the expected ratings
      </summary>
      <div className="space-y-2 pb-2 text-sm text-[var(--muted)]">
        <p>
          An expected rating is a guess at how the fight will rate once it has been fought, on the same 1 to 5
          scale. It uses only what is public: the ratings of each fighter&apos;s earlier fights and where the bout
          sits on the card (main event, title, division).
        </p>
        <p>
          We tested this on past fights, predicting each year from the years before it. The expectations are
          clearly better than guessing the average, and the fights we expected most from really did rate higher
          on average. A single fight can still land far from its expectation, and nothing here says how a fight
          will end.
        </p>
      </div>
    </details>
  );
}

/** An event that has not happened yet: when and where, then the announced bouts. */
export function UpcomingView({ event, today }: { event: UpcomingEvent; today: Date }) {
  const names = headliners(event);
  const days = daysUntil(event.eventDate, today);
  const parts = groups(event.bouts);
  const hasExpectations = event.bouts.some((b) => b.prediction !== null);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-2 border-[var(--text)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="display-tight text-lg text-[var(--muted)]">{eventLabel(event.name)}</p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="display mt-1 min-w-0 break-words text-4xl leading-[0.95] sm:text-5xl">
            {names ? `${names[0]} vs ${names[1]}` : event.name}
          </h1>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <div className="field">
            <p className="display-tight text-lg">{formatEventDate(event.eventDate)}</p>
            <span className="field-label">Date</span>
          </div>
          <div className="field">
            <p className="display-tight text-lg text-[var(--accent)]">{countdownLabel(days)}</p>
            <span className="field-label">Starts</span>
          </div>
          {event.location && (
            <div className="field">
              <p className="display-tight text-lg">{event.location}</p>
              <span className="field-label">Venue</span>
            </div>
          )}
        </div>
      </header>

      {parts.length === 0 ? (
        <Notice>The card for this event has not been announced yet.</Notice>
      ) : (
        <>
          <Notice>Announced card. Bouts can still change before the event.</Notice>
          {hasExpectations && <About />}
          {parts.map((part) => (
            <section key={part.label ?? "card"} aria-label={part.label ?? "Card"}>
              {part.label && (
                <h2 className="display-tight mb-3 flex items-center gap-3 text-lg">
                  <span className="redact px-2 py-0.5">{part.label}</span>
                  <span aria-hidden="true" className="h-0.5 flex-1 bg-[var(--text)]" />
                </h2>
              )}
              <ol className="space-y-4">
                {part.bouts.map((bout) => (
                  <UpcomingBoutCard key={bout.id} bout={bout} />
                ))}
              </ol>
            </section>
          ))}
        </>
      )}

      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--accent)]"
      >
        All events
      </Link>
    </div>
  );
}
