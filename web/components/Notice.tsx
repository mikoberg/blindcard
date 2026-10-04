export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]"
    >
      {children}
    </p>
  );
}
