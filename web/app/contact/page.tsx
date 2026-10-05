import type { Metadata } from "next";
import { ExternalLink, InfoPage, InfoSection } from "@/components/InfoPage";
import { getContactEmail, ISSUES_URL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact and corrections",
  description: "Report a mistake, ask for a correction or a removal, or get in touch about Blindcard.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const email = getContactEmail();
  return (
    <InfoPage
      title="Contact and corrections"
      lead="Found a mistake, or want something changed or removed? Tell us."
    >
      <InfoSection id="reach" title="How to reach us">
        {email ? (
          <p>
            Email{" "}
            <a
              href={`mailto:${email}`}
              className="font-semibold text-[var(--text)] underline underline-offset-4 hover:text-[var(--accent)]"
            >
              {email}
            </a>
            .
          </p>
        ) : (
          <p>
            Open an issue on <ExternalLink href={ISSUES_URL}>our project page on GitHub</ExternalLink>. It is
            public, so do not put anything private in it.
          </p>
        )}
      </InfoSection>

      <InfoSection id="what" title="What to send">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>A wrong fact or rating:</strong> the page address and what is wrong. A rating is only a
            mistake if the data behind it is wrong; a rating you disagree with is not.
          </li>
          <li>
            <strong>A correction or removal about a person</strong> (a fighter or a judge): the page address and
            what you want changed. We look at every request.
          </li>
          <li>
            <strong>A rights holder or a source:</strong> say which material, where it appears and what you want
            changed.
          </li>
          <li>
            <strong>A spoiler:</strong> if a page showed you something about a result before you pressed
            Reveal, tell us which page. That is a bug we want to fix first.
          </li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}
