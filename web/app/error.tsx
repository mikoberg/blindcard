"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">Something went wrong</h1>
      <p className="text-[var(--muted)]">We couldn&apos;t load this page. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold hover:border-[var(--accent)]"
      >
        Try again
      </button>
    </div>
  );
}
