"use client";

import type { RoomPlayer } from "@/room/store";

interface LiveLeaderboardProps {
  players: (RoomPlayer & { rank?: number })[];
  selfId?: string;
  compact?: boolean;
}

export function LiveLeaderboard({
  players,
  selfId,
  compact,
}: LiveLeaderboardProps) {
  const ranked = [...players]
    .map((p, i) => ({
      ...p,
      rank: p.rank ?? i + 1,
      display: p.totalScore + (p.holding ? Math.floor(p.currentHold) : 0),
    }))
    .sort((a, b) => b.display - a.display)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return (
    <div className={`live-board ${compact ? "is-compact" : ""}`}>
      <header className="live-board-head">
        <h2>Leaderboard</h2>
        <span>{ranked.length} players</span>
      </header>
      <ol className="live-board-list">
        {ranked.map((p) => (
          <li
            key={p.id}
            className={`${p.id === selfId ? "is-you" : ""} status-${p.status.toLowerCase()}`}
          >
            <span className="lb-rank">#{p.rank}</span>
            <span className="lb-name">
              {p.label}
              {p.id === selfId ? " · you" : ""}
            </span>
            <span className="lb-status">{p.status}</span>
            <span className="lb-score">
              {p.totalScore}
              {p.holding && p.currentHold > 0 ? (
                <em>+{Math.floor(p.currentHold)}</em>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
