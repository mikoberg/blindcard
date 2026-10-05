"use client";

// In this Next.js version `retry()` re-fetches and re-renders the segment; `reset()` would only clear
// the error and render the same failing children again.
export default function ErrorPage({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="space-y-3 py-10">
      <h1 className="page-title">Something went wrong</h1>
      <p className="text-[var(--muted)]">We couldn&apos;t load this page. Please try again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="redact min-h-11 px-4 text-sm font-bold hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
      >
        Try again
      </button>
    </div>
  );
}
