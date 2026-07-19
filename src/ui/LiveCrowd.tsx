"use client";

import type { EngineSnapshot } from "@/game/engine";

interface Props {
  snap: EngineSnapshot;
}

function crowdMessage(snap: EngineSnapshot, index: number): string {
  const ticker = snap.ticker[index]?.text;
  if (ticker) return ticker.replace(/\bx\b/g, "×");
  const ghost = snap.ghosts[index];
  if (ghost?.cashedOut && ghost.cashOutAt) {
    return `${ghost.name} cashed out at ${ghost.cashOutAt.toFixed(2)}×`;
  }
  return ghost ? `${ghost.name} is still holding` : "The crowd is watching the next move";
}

export function LiveCrowd({ snap }: Props) {
  const active = snap.ghosts.filter((g) => !g.cashedOut).length;
  const messages = [0, 1, 2].map((i) => crowdMessage(snap, i));

  return (
    <section className="crowd-strip" aria-label="Live crowd activity">
      <div className="crowd-heading">
        <span><i /> Live crowd</span>
        <small>{active + 1} still holding</small>
      </div>
      <div className="crowd-feed">
        {messages.map((message, index) => (
          <div className={index === 0 ? "crowd-item is-new" : "crowd-item"} key={`${message}-${index}`}>
            <span className={`crowd-avatar crowd-avatar-${index + 1}`} aria-hidden>
              {message.charAt(0).toUpperCase()}
            </span>
            <p>{message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
