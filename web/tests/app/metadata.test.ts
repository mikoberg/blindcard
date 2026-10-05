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
    expect(homeMetadata).not.toHaveProperty("description");
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
