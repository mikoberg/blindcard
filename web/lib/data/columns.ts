/**
 * The only column lists the web app may select. Public, pre-fight facts and the final
 * star rating only: no result columns, and not `source` / `source_id` (a source id points
 * at a third-party results page). tests/columns.test.ts enforces this.
 */
export const EVENT_COLUMNS = "id, name, slug, event_date, location";
export const FIGHT_COLUMNS =
  "id, event_id, card_position, card_segment, career, records, elo, ranks, weight_class, is_title_fight, scheduled_rounds, fighter_a_id, fighter_b_id";
export const FIGHTER_COLUMNS = "id, name, country, style, slug";
/** Which fighters have a profile page: the ones with a rated fight (the `fighter_ratings` view). */
export const FIGHTER_PAGE_COLUMNS = "slug";
export const SCORE_COLUMNS = "fight_id, stars, percentile";
export const VERSION_COLUMNS = "version";
export const ID_COLUMN = "id";
export const OVERVIEW_COLUMNS = "id, slug, name, event_date, location, ratings, main_event_a, main_event_b, main_event_title";
/** Public, pre-fight sums per event (see migration 0031). */
export const EVENT_FACET_COLUMNS =
  "event_id, title_fights, five_round_fights, womens_fights, rematches, longest_streak, even_fights, elo_gap_avg, elo_avg, elo_peak, ranked_fighters, champions, top5_fighters, ranked_bouts, weight_classes, countries";
export const FIGHTER_RATING_COLUMNS = "id, name, country, rated_fights, avg_stars, slug, last_fight";
export const FIGHTER_FIGHT_COLUMNS =
  "event_slug, event_name, event_date, opponent_name, stars, fight_id, weight_class, is_title_fight, opponent_slug";
/** The night-bonus totals of every fighter that has them (see migration 0033). */
export const FIGHTER_AWARD_COLUMNS = "slug, awards";
/** A fighter's standing as of today (see migration 0027). */
export const FIGHTER_NOW_COLUMNS = "style, record, elo, awards";
export const FIGHT_RATING_COLUMNS =
  "fight_id, event_slug, event_name, event_date, fighter_a_name, fighter_b_name, weight_class, is_title_fight, stars";
export const FIGHT_VIDEO_COLUMNS = "fight_id, youtube_id";
export const JUDGE_COLUMNS =
  "slug, name, slugs, cards, dissent, lone_dissent, abs_sum, abs_sumsq, first_year, last_year";
export const JUDGE_BASELINE_COLUMNS = "cards, dissent, abs_sum, abs_sumsq, judges_with_enough";

export const UPCOMING_EVENT_COLUMNS =
  "id, name, slug, event_date, location, main_card_at, prelims_at, early_prelims_at";
export const UPCOMING_BOUT_COLUMNS =
  "id, event_id, card_position, segment, weight_class, is_title_fight, fighter_a_name, fighter_b_name, predicted_stars, prediction_basis, prediction_why, has_pick, fighter_a_record, fighter_b_record, fighter_a_elo, fighter_b_elo, fighter_a_rank, fighter_b_rank, fighter_a_style, fighter_b_style, fighter_a:fighters!fighter_a_id(slug, country, style), fighter_b:fighters!fighter_b_id(slug, country, style)";
