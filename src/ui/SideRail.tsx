"use client";

import type { EngineSnapshot } from "@/game/engine";
import type { LeaderboardEntry } from "@/lib/leaderboard";

interface Props {
  snap: EngineSnapshot;
  board: LeaderboardEntry[];
  playerKey?: string;
  soundOn: boolean;
  onToggleSound: () => void;
}

/** Leaderboard + event feed. Rendered in a bottom sheet on mobile, side rail on desktop. */
export function BoardPanel({
  snap,
  board,
  playerKey,
  soundOn,
  onToggleSound,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          Leaderboard
        </h2>
        <ol className="space-y-1.5 font-mono text-[13px]">
          {board.slice(0, 8).map((e, i) => (
            <li
              key={e.key}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${
                e.key === playerKey
                  ? "bg-volt/10 text-volt"
                  : "text-white/70"
              }`}
            >
              <span className="truncate">
                <span className="mr-1.5 inline-block w-4 text-white/30">
                  {i + 1}
                </span>
                {e.label}
                {e.isGhost ? (
                  <span className="ml-1 text-[10px] text-white/25">bot</span>
                ) : null}
              </span>
              <span className="tabular-nums">{e.balance}</span>
            </li>
          ))}
          {board.length === 0 && (
            <li className="px-2 text-white/30">No scores yet</li>
          )}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          Feed
        </h2>
        <ul className="max-h-44 space-y-1 overflow-y-auto font-mono text-xs text-white/60">
          {snap.ticker.slice(0, 14).map((t) => (
            <li key={t.id} className="truncate border-l-2 border-white/10 pl-2">
              {t.text}
            </li>
          ))}
          {snap.ticker.length === 0 && (
            <li className="text-white/30">Waiting for action…</li>
          )}
        </ul>
      </section>

      <section className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onToggleSound}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10"
        >
          <span>Heartbeat sound</span>
          <span
            className={`font-mono text-xs ${soundOn ? "text-volt" : "text-white/40"}`}
          >
            {soundOn ? "ON" : "OFF"}
          </span>
        </button>
      </section>
    </div>
  );
}
