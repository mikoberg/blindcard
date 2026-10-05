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
        },
      ],
    },
  ];

  it("lists each fight with its card link, event and the 5.0 mark", () => {
    const html = renderToStaticMarkup(<ClassicsList years={years} />);
    expect(html).toContain('href="/events/event-one#fight-f1"');
    expect(html).toContain("Ann One");
    expect(html).toContain("Event One");
    expect(html).toContain("Lightweight, Title fight");
    expect(html).toContain("5.0");
    expect(html).toContain('href="#year-2025"');
  });

  it("has a play link per fight that opens a YouTube search in a new tab", () => {
    const html = renderToStaticMarkup(<ClassicsList years={years} />);
    expect(html).toContain("https://www.youtube.com/results?search_query=Ann%20One%20vs");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("full%20fight%202025");
  });

  it("escapes hostile names", () => {
    expect(renderToStaticMarkup(<ClassicsList years={years} />)).not.toContain("<img src=x");
  });
});
