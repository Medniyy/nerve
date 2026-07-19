"use client";

import type { PossessionSnapshot } from "@/game/possessionEngine";
import { GAME_CONFIG } from "@/game/config";
import { BallIcon } from "@/ui/BallIcon";
import { TeamFlag } from "@/ui/TeamFlag";

interface MatchStripProps {
  snap: PossessionSnapshot;
  mode: "replay" | "live";
  speed: number;
  onSpeed: (n: number) => void;
  onExit: () => void;
  onOpenBoard?: () => void;
  onHelp?: () => void;
  roomCode?: string;
}

function fmtRemaining(ms: number | null): string {
  if (ms == null) return "FULL";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function MatchStrip({
  snap,
  mode,
  speed,
  onSpeed,
  onExit,
  onOpenBoard,
  onHelp,
  roomCode,
}: MatchStripProps) {
  return (
    <header className="match-strip">
      <div className="match-strip-top">
        <div className="match-live">
          <i className={snap.syncing ? "is-sync" : "is-live"} />
          {snap.syncing ? "SYNC" : mode === "live" ? "LIVE" : "REPLAY"}
        </div>
        <div className="match-clock">{snap.matchMinute}&apos;</div>
        <div className="match-timer" title="Session remaining">
          {fmtRemaining(snap.sessionRemainingMs)}
        </div>
        <div className="match-actions">
          {mode === "replay" && (
            <select
              className="speed-select"
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              aria-label="Replay speed"
            >
              {GAME_CONFIG.REPLAY_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          )}
          {onOpenBoard && (
            <button type="button" className="strip-btn lg:hidden" onClick={onOpenBoard}>
              Board
            </button>
          )}
          {onHelp && (
            <button type="button" className="strip-btn" onClick={onHelp}>
              ?
            </button>
          )}
          <button type="button" className="strip-btn" onClick={onExit}>
            Exit
          </button>
        </div>
      </div>

      <div className="match-scoreline">
        <span className={`team ${snap.possessionTeam === "home" ? "has-ball" : ""}`}>
          {snap.possessionTeam === "home" && !snap.syncing && (
            <BallIcon className="score-ball" />
          )}
          <TeamFlag team={snap.homeTeam} />
          {snap.homeTeam}
        </span>
        <strong>
          {snap.homeScore}–{snap.awayScore}
        </strong>
        <span className={`team ${snap.possessionTeam === "away" ? "has-ball" : ""}`}>
          {snap.awayTeam}
          <TeamFlag team={snap.awayTeam} />
          {snap.possessionTeam === "away" && !snap.syncing && (
            <BallIcon className="score-ball" />
          )}
        </span>
      </div>

      <p
        className={`match-possession ${snap.syncing ? "is-sync" : ""}`}
        key={snap.possessionLabel}
      >
        <i className="poss-dot" aria-hidden />
        {snap.possessionLabel}
      </p>

      {roomCode && (
        <p className="match-room">
          Room <strong>{roomCode}</strong>
        </p>
      )}
    </header>
  );
}
