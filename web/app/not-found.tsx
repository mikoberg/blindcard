import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 py-10">
      <h1 className="page-title">Not found</h1>
      <p className="text-[var(--muted)]">We couldn&apos;t find that page.</p>
      <Link href="/" className="inline-flex min-h-11 items-center font-bold text-[var(--accent)] underline underline-offset-4">
        Back to the latest card
      </Link>
    </div>
  );
}
