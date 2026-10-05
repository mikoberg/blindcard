import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardEvent } from "@/lib/card/types";

const mocks = vi.hoisted(() => ({
  getEventBySlug: vi.fn(),
  listEvents: vi.fn(),
  getCard: vi.fn(),
}));

// The data layer would reach the network; metadata tests never need it.
vi.mock("@/lib/data/events", () => ({
  getEventBySlug: mocks.getEventBySlug,
  listEvents: mocks.listEvents,
  isValidSlug: (slug: string) => /^[a-z0-9-]{1,200}$/.test(slug),
}));
vi.mock("@/lib/data/card", () => ({ getCard: mocks.getCard }));
// The layout loads fonts through a Next build plugin that does not exist under Vitest.
vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "archivo-var" }),
}));

import { generateMetadata as eventMetadata } from "@/app/events/[slug]/page";
import { metadata as layoutMetadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/page";
import { HTML_LEAK_PATTERNS, findLeaks } from "./../spoiler/leaks";

const event: CardEvent = {
  id: "e1",
  name: "UFC Fight Night: Alpha vs. Beta",
  slug: "ufc-fight-night-alpha-vs-beta",
  eventDate: "2026-09-26",
  location: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("layout metadata", () => {
  it("has the fixed description and the title template", () => {
    expect(layoutMetadata.description).toBe("Which fights are worth watching, with no spoilers.");
    expect(layoutMetadata.title).toEqual({ default: "Blindcard", template: "Blindcard – %s" });
  });
});

describe("home metadata", () => {
  it("is static: an absolute 'Blindcard – All events' title (the layout template skips the same segment)", () => {
    expect(homeMetadata.title).toEqual({ absolute: "Blindcard – All events" });
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(homeMetadata.openGraph).toMatchObject({ type: "website", url: "/", title: "Blindcard – All events" });
    expect(findLeaks(String(homeMetadata.description), HTML_LEAK_PATTERNS)).toEqual([]);
  });
});

describe("event page metadata", () => {
  it("uses the plain event name (the layout template applies to child segments)", async () => {
    mocks.getEventBySlug.mockResolvedValue(event);
    const meta = await eventMetadata({ params: Promise.resolve({ slug: event.slug }) });
    expect(meta.title).toBe(event.name);
    expect(meta.alternates?.canonical).toBe(`/events/${event.slug}`);
    expect(meta.openGraph).toMatchObject({ type: "website", url: `/events/${event.slug}` });
    // The description names the event and its date and nothing about any fight.
    expect(meta.description).toBe(
      "Which fights on UFC Fight Night: Alpha vs. Beta (Sat 26 Sep 2026) are worth watching? A rating for every fight, and no results.",
    );
    expect(findLeaks(String(meta.description), HTML_LEAK_PATTERNS)).toEqual([]);
  });

  it("says 'Event not found' for an unknown slug", async () => {
    mocks.getEventBySlug.mockResolvedValue(null);
    const meta = await eventMetadata({ params: Promise.resolve({ slug: "nope" }) });
    expect(meta.title).toBe("Event not found");
  });

  it("says 'Event not found' for an invalid slug without querying", async () => {
    const meta = await eventMetadata({ params: Promise.resolve({ slug: "Bad Slug!" }) });
    expect(meta.title).toBe("Event not found");
    expect(mocks.getEventBySlug).not.toHaveBeenCalled();
  });
});
