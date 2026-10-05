/** A plain reading page: a title, a short lead, then sections. Used for About, Privacy and Contact. */
export function InfoPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <article className="max-w-2xl space-y-10 py-4">
      <header>
        <h1 className="page-title">{title}</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">{lead}</p>
      </header>
      {children}
    </article>
  );
}

export function InfoSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 border-t-2 border-[var(--text)] pt-6">
      <h2 id={id} className="display text-xl sm:text-2xl">
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className="font-semibold text-[var(--text)] underline underline-offset-4 hover:text-[var(--accent)]"
    >
      {children}
    </a>
  );
}
