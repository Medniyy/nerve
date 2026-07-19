"use client";

interface Props {
  holding: boolean;
  canAct: boolean;
  onHold: () => void;
  onCashOut: () => void;
  phase: string;
  stake: number;
  payout: number;
}

/**
 * The one thumb button. Fixed to the bottom of the screen on mobile,
 * always full-width, always ≥ 64px tall.
 */
export function ActionButton({
  holding,
  canAct,
  onHold,
  onCashOut,
  phase,
  stake,
  payout,
}: Props) {
  if (phase === "crashed" || phase === "waiting") {
    return (
      <div className="action-button action-button-wait" role="status">
        <span className="action-wait-dot" />
        {phase === "crashed" ? "Goal · resetting the round" : "Next round loading"}
      </div>
    );
  }

  if (holding) {
    return (
      <button
        type="button"
        disabled={!canAct}
        onClick={onCashOut}
        className="action-button action-button-cash"
      >
        <span>Cash out</span><strong>{payout.toLocaleString()} pts</strong>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={!canAct}
      onClick={onHold}
      className="action-button action-button-hold"
    >
      <span>Hold</span><strong>{stake} pts</strong>
    </button>
  );
}
