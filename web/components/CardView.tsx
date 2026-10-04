import { cardStatus } from "@/lib/card/state";
import type { CardEvent, CardFight } from "@/lib/card/types";
import { watchThese } from "@/lib/card/watchThese";
import { EventHeader } from "./EventHeader";
import { FightList } from "./FightList";
import { Notice } from "./Notice";
import { WatchThese } from "./WatchThese";

export function CardView({ event, fights }: { event: CardEvent; fights: readonly CardFight[] }) {
  const status = cardStatus(fights);
  return (
    <div className="space-y-8">
      <EventHeader event={event} />
      {status === "empty" && <Notice>The card for this event isn&apos;t available yet.</Notice>}
      {status === "pending" && <Notice>Ratings are on their way.</Notice>}
      {status === "rated" && <WatchThese fights={watchThese(fights)} />}
      {status !== "empty" && <FightList fights={fights} />}
    </div>
  );
}
