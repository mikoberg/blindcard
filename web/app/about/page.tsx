import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, InfoPage, InfoSection } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About and method",
  description:
    "How Blindcard rates fights without spoiling them: what the stars mean, what stays hidden, how the expected ratings and model leans work, and where the data comes from.",
  path: "/about",
  root: true,
});

const LINK = "font-semibold underline underline-offset-4";

export default function AboutPage() {
  return (
    <InfoPage
      title="About and method"
      lead="Blindcard tells you which fights on a card are worth watching, without telling you what happened in them."
    >
      <InfoSection id="stars" title="What the stars mean">
        <p>
          Every fight that has been rated gets 1 to 5 stars, in half steps. The rating is made from the
          fight&apos;s own numbers: how much was thrown and landed per minute, knockdowns, submission attempts,
          swings of momentum between rounds and how close the fight was. Those numbers are compared with all
          rated fights since 2001, so the stars say how a fight ranks against the others.
        </p>
        <p>
          5.0 is rare: roughly the top one percent of fights, shown as a classic. 4.0 and up is the top 30
          percent and 3.0 is the middle of the pack. The stars measure action, not quality or importance, and
          not whether a fight matters for a title.
        </p>
        <p>
          A rating cannot be fully neutral: a fight with a lot of action tends to look different from a quiet
          one, and that is the point. It is the only hint a rating gives. Nothing about who won, how, or when
          it ended is part of what you see before you reveal a fight.
        </p>
      </InfoSection>

      <InfoSection id="reveal" title="What stays hidden">
        <p>
          Winners, methods, rounds, times, bonuses and scorecards are kept in a separate part of the database
          that the public pages cannot read. They are only served when you press Reveal on one fight, and only
          for that fight. Revealing one fight does not reveal the others on the card.
        </p>
        <p>
          Fighter records on the pages are the records going into each fight, never updated afterwards. Fights
          are ordered by card position or by rating, never by anything that depends on the outcome.
        </p>
      </InfoSection>

      <InfoSection id="expected" title="Expected ratings for upcoming fights">
        <p>
          For announced fights there is no rating yet, so the page shows an expected one. It is learned from
          the ratings of both fighters&apos; earlier fights and from public facts about the card, never from a
          result of the fight itself. It is a rough guide: on past cards it was off by about 0.8 stars on
          average, against about 0.9 for always guessing the typical rating. Treat it as a hint.
        </p>
      </InfoSection>

      <InfoSection id="lean" title="The model lean">
        <p>
          On upcoming fights you can open a model lean: which fighter a statistical model leans towards and
          how strongly. It is closed by default because it can colour how you watch. It is built from the
          results of fighters&apos; earlier fights and was right about 56 percent of the time when tested on
          past fights (a coin flip is 50 percent). It is a small lean and never a certainty.
        </p>
        <p>This is not betting advice and nothing here is meant to be used for betting.</p>
      </InfoSection>

      <InfoSection id="judges" title="Judge pages">
        <p>
          The judge pages summarise public scorecards: how often a judge&apos;s card differs from the official
          result, and how wide the gaps on their cards are. They are totals, they are not a rating of anyone,
          and with a limited number of scorecards a difference can be chance. The pages say so, and they are
          kept out of search engines. If something is wrong,{" "}
          <Link href="/contact" className={LINK}>
            tell us
          </Link>
          .
        </p>
      </InfoSection>

      <InfoSection id="limits" title="Limits">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            New cards appear hours after an event, because the statistics come from a source that refreshes
            about once a day.
          </li>
          <li>
            The data comes from public sources and can contain errors. Fighters who share a name can end up as
            one profile.
          </li>
          <li>
            Fights from before 2001, and the occasional fight with incomplete statistics, have no rating. They
            are shown as &quot;not rated yet&quot;.
          </li>
          <li>
            The scoring is a model. It was checked against historical data, but taste differs and a 2.5 can
            still be your fight of the year.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="sources" title="Sources and credits">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Fight statistics: a public mirror of published fight statistics,{" "}
            <ExternalLink href="https://github.com/Greco1899/scrape_ufc_stats">scrape_ufc_stats</ExternalLink>{" "}
            (GPL-3.0).
          </li>
          <li>
            Card order, bonuses, fighter countries, fighting styles, records going into fights and the
            announced cards: <ExternalLink href="https://en.wikipedia.org">Wikipedia</ExternalLink>, available
            under <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</ExternalLink>,
            and <ExternalLink href="https://www.wikidata.org">Wikidata</ExternalLink> (CC0).
          </li>
          <li>
            Records that Wikipedia does not give: <ExternalLink href="https://www.sherdog.com">Sherdog</ExternalLink>.
          </li>
          <li>
            Start times and some fighting styles: the promotion&apos;s official event and athlete pages, read
            slowly and only where the site allows it.
          </li>
          <li>Watch links: the official channel on YouTube. Only the link is stored.</li>
          <li>Typeface: Archivo, under the SIL Open Font License.</li>
        </ul>
        <p>
          Our requests carry an identifying User-Agent, are limited to about one per second and are cached. If
          you run one of these sources and want something changed,{" "}
          <Link href="/contact" className={LINK}>
            write to us
          </Link>
          .
        </p>
      </InfoSection>

      <InfoSection id="independent" title="Not affiliated">
        <p>
          Blindcard is an unofficial fan project, not affiliated with any promotion. Event and fighter names
          are used only to say which fight is meant. There are no fighter photos or official imagery on this
          site.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
