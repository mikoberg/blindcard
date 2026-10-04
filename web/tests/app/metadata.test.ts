import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardEvent } from "@/lib/card/types";

const mocks = vi.hoisted(() => ({
  getLatestEventWithFights: vi.fn(),
  getEventBySlug: vi.fn(),
  listEvents: vi.fn(),
  getCard: vi.fn(),
}));

// The data layer would reach the network; metadata tests never need it.
vi.mock("@/lib/data/events", () => ({
  getLatestEventWithFights: mocks.getLatestEventWithFights,
  getEventBySlug: mocks.getEventBySlug,
  listEvents: mocks.listEvents,
  isValidSlug: (slug: string) => /^[a-z0-9-]{1,200}$/.test(slug),
}));
vi.mock("@/lib/data/card", () => ({ getCard: mocks.getCard }));
// The layout loads fonts through a Next build plugin that does not exist under Vitest.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "inter-var" }),
  Barlow_Condensed: () => ({ variable: "barlow-var" }),
}));

import { generateMetadata as eventMetadata } from "@/app/events/[slug]/page";
import { metadata as eventsMetadata } from "@/app/events/page";
import { metadata as layoutMetadata } from "@/app/layout";
import { generateMetadata as homeMetadata } from "@/app/page";

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
  it("uses an absolute 'Blindcard – event' title (the layout template skips the same segment)", async () => {
    mocks.getLatestEventWithFights.mockResolvedValue(event);
    const meta = await homeMetadata();
    expect(meta.title).toEqual({ absolute: "Blindcard – UFC Fight Night: Alpha vs. Beta" });
    expect(meta.alternates?.canonical).toBe(`/events/${event.slug}`);
    expect(meta).not.toHaveProperty("description");
  });

  it("falls back to the layout default when there is no event", async () => {
    mocks.getLatestEventWithFights.mockResolvedValue(null);
    const meta = await homeMetadata();
    expect(meta).not.toHaveProperty("title");
    expect(meta).not.toHaveProperty("description");
  });
});

describe("event page metadata", () => {
  it("uses the plain event name (the layout template applies to child segments)", async () => {
    mocks.getEventBySlug.mockResolvedValue(event);
    const meta = await eventMetadata({ params: Promise.resolve({ slug: event.slug }) });
    expect(meta.title).toBe(event.name);
    expect(meta.alternates?.canonical).toBe(`/events/${event.slug}`);
    expect(meta).not.toHaveProperty("description");
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

describe("events list metadata", () => {
  it("has a title and inherits the layout description", () => {
    expect(eventsMetadata.title).toBe("All events");
    expect(eventsMetadata).not.toHaveProperty("description");
  });
});
