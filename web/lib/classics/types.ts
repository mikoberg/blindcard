/** One row of the `fight_ratings` view: a rated fight, pre-fight facts and the public rating only. */
export interface FightRatingRow {
  fight_id: string;
  event_slug: string;
  event_name: string;
  event_date: string;
  fighter_a_name: string;
  fighter_b_name: string;
  weight_class: string | null;
  is_title_fight: boolean;
  stars: number | string;
}

export interface ClassicFight {
  id: string;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  fighterA: string;
  fighterB: string;
  weightClass: string | null;
  isTitleFight: boolean;
}

export interface ClassicYear {
  year: string;
  fights: ClassicFight[];
}
