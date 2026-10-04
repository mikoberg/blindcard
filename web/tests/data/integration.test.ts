import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getCard } from "@/lib/data/card";
import { getEventBySlug, getLatestEventWithFights, listEvents } from "@/lib/data/events";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const live = describe.skipIf(!url || !key);

live("dev database through the anon key", () => {
  it("lists events newest first", async () => {
    const events = await listEvents();
    expect(events.length).toBeGreaterThan(0);
    const dates = events.map((e) => e.eventDate);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("loads the latest event with a card whose ratings are valid", async () => {
    const event = await getLatestEventWithFights();
    expect(event).not.toBeNull();
    const card = await getCard(event!.id);
    expect(card.length).toBeGreaterThan(0);
    expect(card.map((f) => f.cardPosition)).toEqual([...card.map((f) => f.cardPosition)].sort((a, b) => a - b));
    for (const fight of card) {
      if (fight.rating) {
        expect(fight.rating.stars).toBeGreaterThanOrEqual(1);
        expect(fight.rating.stars).toBeLessThanOrEqual(5);
      }
    }
    expect((await getEventBySlug(event!.slug))?.id).toBe(event!.id);
    expect(await getEventBySlug("definitely-not-an-event")).toBeNull();
  });

  it("anon cannot read any result table", async () => {
    const anon = createClient(url!, key!, { auth: { persistSession: false } });
    for (const table of ["fight_results", "fight_rounds", "excitement_features"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error, table).not.toBeNull();
      expect(data, table).toBeNull();
    }
  });

  it("reveal_fight returns at most one row per fight, and exactly one for a fight with a result", async () => {
    const event = await getLatestEventWithFights();
    const card = await getCard(event!.id);
    const anon = createClient(url!, key!, { auth: { persistSession: false } });
    let foundOne = false;
    for (const fight of card) {
      const { data, error } = await anon.rpc("reveal_fight", { p_fight_id: fight.id });
      expect(error).toBeNull();
      const rows = Array.isArray(data) ? data.length : -1;
      expect([0, 1]).toContain(rows); // never more than one row for one fight
      if (rows === 1) {
        foundOne = true;
        break;
      }
    }
    expect(foundOne, "at least one fight on the latest card should have a result").toBe(true);
  });
});
