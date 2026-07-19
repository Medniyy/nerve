"use client";

import type { EngineSnapshot } from "@/game/engine";
import { GAME_CONFIG } from "@/game/config";

interface Props {
  snap: EngineSnapshot;
  mode: "replay" | "live";
  speed: number;
  onSpeed: (n: number) => void;
  onExit: () => void;
  onOpenBoard: () => void;
  onHelp: () => void;
}

export function MatchStrip({
  snap,
  mode,
  speed,
  onSpeed,
  onExit,
  onOpenBoard,
  onHelp,
}: Props) {
  const cycleSpeed = () => {
    const speeds = GAME_CONFIG.REPLAY_SPEEDS;
    const i = speeds.indexOf(speed as (typeof speeds)[number]);
    onSpeed(speeds[(i + 1) % speeds.length]);
  };

  const iconBtn = "match-icon-button";

  return (
    <header className="match-strip">
      <button
        type="button"
        onClick={onExit}
        className={iconBtn}
        aria-label="Exit to lobby"
      >
        ←
      </button>

      <div className="match-scoreline">
        <span className="text-white">
          {snap.homeTeam}{" "}
          <strong className="text-volt">{snap.homeScore}</strong>
        </span>
        <span className="text-white/30">–</span>
        <span className="text-white">
          <strong className="text-volt">{snap.awayScore}</strong>{" "}
          {snap.awayTeam}
        </span>
        <span className="ml-2 text-white/45">{snap.matchMinute}&apos;</span>
        {mode === "live" && (
          <span className="live-flag">
            <i /> live
          </span>
        )}
      </div>

      {mode === "replay" && (
        <button
          type="button"
          onClick={cycleSpeed}
          className={iconBtn}
          aria-label={`Replay speed ${speed}x — tap to change`}
        >
          {speed}×
        </button>
      )}
      <button
        type="button"
        onClick={onHelp}
        className={iconBtn}
        aria-label="How to play"
      >
        ?
      </button>
      <button
        type="button"
        onClick={onOpenBoard}
        className={iconBtn}
        aria-label="Leaderboard and feed"
      >
        ☰
      </button>
    </header>
  );
}
