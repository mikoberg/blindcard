import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClassicsList } from "@/components/ClassicsList";

describe("ClassicsList", () => {
  const years = [
    {
      year: "2025",
      fights: [
        {
          id: "f1",
          eventSlug: "event-one",
          eventName: "Event One",
          eventDate: "2025-05-05",
          fighterA: "Ann One",
          fighterB: "<img src=x onerror=alert(1)>",
          weightClass: "Lightweight",
          isTitleFight: true,
          videoId: "dQw4w9WgXcQ",
        },
      ],
    },
  ];

  it("lists each fight with its card link, event and meta line", () => {
    const html = renderToStaticMarkup(<ClassicsList years={years} />);
    expect(html).toContain('href="/events/event-one#fight-f1"');
    expect(html).toContain("Ann One");
    expect(html).toContain("Event One");
    expect(html).toContain("Lightweight");
    expect(html).toContain("Title fight");
    expect(html).not.toContain("5.0"); // every fight here is a 5.0: the number is stated once, in the page header
    expect(html).toContain('href="#year-2025"');
  });

  it("has a play link to the official video, only for fights that have one", () => {
    const html = renderToStaticMarkup(<ClassicsList years={years} />);
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('target="_blank"');
    const none = [{ year: "2025", fights: [{ ...years[0]!.fights[0]!, videoId: null }] }];
    expect(renderToStaticMarkup(<ClassicsList years={none} />)).not.toContain("youtube.com");
  });

  it("escapes hostile names", () => {
    expect(renderToStaticMarkup(<ClassicsList years={years} />)).not.toContain("<img src=x");
  });
});
