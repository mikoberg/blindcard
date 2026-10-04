import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isValidStars } from "@/lib/card/stars";
import type { CardFight } from "@/lib/card/types";
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
    expect((await getEventBySlug(event!.slug))?.id).toBe(event!.id);
    expect(await getEventBySlug("definitely-not-an-event")).toBeNull();
  });

  it("finds a card with ratings, and every rating is valid (the scores path works end to end)", async () => {
    // Walk newest first until a rated card turns up; if none of the first 20 has one, the
    // active-version score query is returning nothing and this must fail rather than pass vacuously.
    let ratedCard: CardFight[] | null = null;
    for (const event of (await listEvents()).slice(0, 20)) {
      const card = await getCard(event.id);
      if (card.some((fight) => fight.rating !== null)) {
        ratedCard = card;
        break;
      }
    }
    expect(ratedCard, "none of the 20 newest events has a rated fight").not.toBeNull();
    const ratings = ratedCard!.flatMap((fight) => (fight.rating ? [fight.rating] : []));
    expect(ratings.length).toBeGreaterThan(0);
    for (const rating of ratings) {
      expect(isValidStars(rating.stars)).toBe(true);
      expect(rating.percentile).toBeGreaterThanOrEqual(0);
      expect(rating.percentile).toBeLessThanOrEqual(100);
    }
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
    let withResult = 0;
    for (const fight of card) {
      const { data, error } = await anon.rpc("reveal_fight", { p_fight_id: fight.id });
      expect(error).toBeNull();
      const rows = Array.isArray(data) ? data.length : -1;
      expect([0, 1]).toContain(rows); // never more than one row for one fight
      if (rows === 1) withResult += 1;
    }
    expect(withResult, "at least one fight on the latest card should have a result").toBeGreaterThan(0);
  });
});
