"use client";

import { GAME_CONFIG } from "@/game/config";
import { useEffect, useState } from "react";

export function SponsorTicker({
  messages = GAME_CONFIG.SPONSOR_MESSAGES,
}: {
  messages?: readonly string[];
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, GAME_CONFIG.SPONSOR_ROTATE_MS);
    return () => clearInterval(id);
  }, [messages.length]);

  const text = messages[idx] ?? messages[0];

  return (
    <div className="sponsor-ticker" aria-hidden>
      <div className="sponsor-ticker-track" key={text}>
        <span>{text}</span>
        <span aria-hidden>{text}</span>
        <span aria-hidden>{text}</span>
      </div>
    </div>
  );
}
