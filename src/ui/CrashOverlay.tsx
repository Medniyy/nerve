"use client";

import type { RoundResult } from "@/game/engine";

interface Props {
  result: RoundResult;
  homeTeam: string;
  awayTeam: string;
  onDismiss?: () => void;
}

export function CrashOverlay({
  result,
  homeTeam,
  awayTeam,
  onDismiss,
}: Props) {
  const team =
    result.goalTeam === "home"
      ? homeTeam
      : result.goalTeam === "away"
        ? awayTeam
        : "";

  const caught = result.playerCaught;

  return (
    <div
      className="crash-backdrop animate-flash fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal
      onClick={onDismiss}
    >
      <div
        className="crash-card sheet-up w-full max-w-md text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crash-net" aria-hidden><span>GOAL</span></div>
        <p className="crash-minute">
          {result.goalMinute}&apos; · {team} scored
        </p>

        <p className="crash-number">
          {result.finalMultiplier.toFixed(2)}
          <span className="text-[0.45em] text-white/40">×</span>
        </p>

        <p
          className={`crash-result ${
            caught
              ? "text-danger"
              : result.playerCashedOut
                ? "text-volt"
                : "text-white/60"
          }`}
        >
          {caught
            ? "Caught · 100 pts lost"
            : result.playerCashedOut
              ? `Escaped at ${result.playerCashOutAt?.toFixed(2)}× (+${result.playerPayout})`
              : "You sat this one out"}
        </p>

        {(result.escaped.length > 0 || result.caught.length > 0) && (
          <div className="crash-crowd">
            <span><strong>{result.escaped.length}</strong> escaped</span>
            <i />
            <span><strong>{result.caught.length}</strong> caught</span>
          </div>
        )}

        <p className="crash-next">
          Next round starts automatically
        </p>
        <button type="button" className="crash-dismiss" onClick={onDismiss}>
          Watch the reset
        </button>
      </div>
    </div>
  );
}
