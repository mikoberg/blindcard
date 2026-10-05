/**
 * The only column lists the web app may select. Public, pre-fight facts and the final
 * star rating only: no result columns, and not `source` / `source_id` (a source id points
 * at a third-party results page). tests/columns.test.ts enforces this.
 */
export const EVENT_COLUMNS = "id, name, slug, event_date, location";
export const FIGHT_COLUMNS =
  "id, event_id, card_position, card_segment, career, records, weight_class, is_title_fight, scheduled_rounds, fighter_a_id, fighter_b_id";
export const FIGHTER_COLUMNS = "id, name, country";
export const SCORE_COLUMNS = "fight_id, stars, percentile";
export const VERSION_COLUMNS = "version";
export const ID_COLUMN = "id";
export const OVERVIEW_COLUMNS = "id, slug, name, event_date, location, ratings, main_event_a, main_event_b, main_event_title";
export const FIGHTER_RATING_COLUMNS = "id, name, country, rated_fights, avg_stars, slug";
export const FIGHTER_FIGHT_COLUMNS = "event_slug, event_name, event_date, opponent_name, stars";
export const FIGHT_RATING_COLUMNS =
  "fight_id, event_slug, event_name, event_date, fighter_a_name, fighter_b_name, weight_class, is_title_fight, stars";
