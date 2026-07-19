"use client";

import type { PossessionIntensity } from "@/game/config";
import { useCallback, useRef } from "react";

interface HoldButtonProps {
  holding: boolean;
  enabled: boolean;
  currentHold: number;
  pointsPerSecond: number;
  intensity: PossessionIntensity | null;
  syncing: boolean;
  lostAmount: number | null;
  lockedAmount: number | null;
  onHoldStart: () => void;
  onHoldRelease: () => void;
}

export function HoldButton({
  holding,
  enabled,
  currentHold,
  pointsPerSecond,
  intensity,
  syncing,
  lostAmount,
  lockedAmount,
  onHoldStart,
  onHoldRelease,
}: HoldButtonProps) {
  const activeRef = useRef(false);

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!enabled || holding || syncing) return;
      activeRef.current = true;
      vibrate(12);
      onHoldStart();
    },
    [enabled, holding, syncing, onHoldStart, vibrate]
  );

  const end = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!activeRef.current && !holding) return;
      activeRef.current = false;
      if (holding) {
        vibrate([8, 30, 8]);
        onHoldRelease();
      }
    },
    [holding, onHoldRelease, vibrate]
  );

  const intensityClass =
    intensity === "HighDanger"
      ? "is-high-danger"
      : intensity === "Danger"
        ? "is-danger"
        : intensity === "Attack"
          ? "is-attack"
          : "is-safe";

  const risky =
    holding && (intensity === "Danger" || intensity === "HighDanger");

  return (
    <div className="hold-stage">
      {lostAmount != null && lostAmount > 0 && (
        <p className="hold-flash is-lost" key={`lost-${lostAmount}`}>
          −{Math.floor(lostAmount)} lost
        </p>
      )}
      {lockedAmount != null && lockedAmount > 0 && !holding && (
        <p className="hold-flash is-locked" key={`lock-${lockedAmount}`}>
          +{Math.floor(lockedAmount)} locked
        </p>
      )}

      <button
        type="button"
        className={`hold-btn ${intensityClass} ${holding ? "is-pressed" : ""} ${
          risky ? "is-risky" : ""
        } ${syncing || !enabled ? "is-disabled" : ""}`}
        disabled={syncing || (!enabled && !holding)}
        onPointerDown={start}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={(e) => {
          if (holding) end(e);
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={holding ? "Release to lock points" : "Hold to earn points"}
      >
        <span className="hold-btn-fill" aria-hidden />
        <span className="hold-btn-inner">
          <strong className="hold-value">
            {holding || currentHold > 0
              ? currentHold.toFixed(currentHold >= 10 ? 0 : 1)
              : "HOLD"}
          </strong>
          {holding ? (
            <>
              <span className="hold-rate">+{pointsPerSecond}/s</span>
              <span className={`hold-hint ${risky ? "is-risky" : ""}`}>
                {risky ? "⚠ Release now?" : "Release to lock"}
              </span>
            </>
          ) : syncing ? (
            <span className="hold-hint">Syncing…</span>
          ) : (
            <span className="hold-hint">Press & hold</span>
          )}
        </span>
      </button>
    </div>
  );
}
