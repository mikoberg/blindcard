import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">Not found</h1>
      <p className="text-[var(--muted)]">We couldn&apos;t find that page.</p>
      <Link href="/" className="inline-block text-[var(--accent)] underline">
        Back to the latest card
      </Link>
    </div>
  );
}
