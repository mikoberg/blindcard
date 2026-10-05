import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Blindcard has no accounts, no cookies and no analytics. What the server sees, and what we do not keep.",
  alternates: { canonical: "/privacy" },
};

const LINK = "font-semibold underline underline-offset-4";

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      lead="Blindcard has no accounts, sets no cookies and has no analytics or advertising."
    >
      <InfoSection id="what" title="What we collect">
        <p>
          Nothing about you on purpose. We do not ask for a name or an email address, there is no sign-up, and
          the site does not store anything in your browser to recognise you later.
        </p>
        <p>
          Like any website, the hosting service sees technical data when you open a page: your IP address, the
          page you asked for, your browser type and the time. This is kept in the host&apos;s server logs for a
          limited time to run the service and to deal with abuse. We do not use it to follow people across
          pages or sites, and we do not sell it.
        </p>
      </InfoSection>

      <InfoSection id="reveal" title="Reveal and search">
        <p>
          When you press Reveal, or search for a fighter, your browser asks our server for that one answer. The
          server asks the database; the database does not see your browser. We do not keep a record of which
          fights you revealed.
        </p>
      </InfoSection>

      <InfoSection id="third" title="Third parties">
        <p>
          The typeface is served from this site, not from a font service. Watch buttons link to the official
          video on YouTube; opening one is a visit to that site, with its own rules. No third-party scripts run
          on these pages.
        </p>
      </InfoSection>

      <InfoSection id="mail" title="If you write to us">
        <p>
          If you send us a message through the{" "}
          <Link href="/contact" className={LINK}>
            contact page
          </Link>
          , we use what you send to answer you and to fix what you reported. We do not pass it on.
        </p>
      </InfoSection>

      <InfoSection id="people" title="People who appear on the site">
        <p>
          Fighters, and the judges on the scorecards, appear with facts that were published elsewhere: names,
          records, results of public sporting events. If you appear on this site and want something corrected
          or removed, use the{" "}
          <Link href="/contact" className={LINK}>
            contact page
          </Link>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
