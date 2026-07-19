"use client";

import { GAME_CONFIG, type PossessionIntensity } from "@/game/config";

const LEVELS: { id: PossessionIntensity; label: string }[] = [
  { id: "Safe", label: "Safe" },
  { id: "Attack", label: "Attack" },
  { id: "Danger", label: "Danger" },
  { id: "HighDanger", label: "High Danger" },
];

const ORDER: Record<PossessionIntensity, number> = {
  Safe: 0,
  Attack: 1,
  Danger: 2,
  HighDanger: 3,
};

interface IntensityMeterProps {
  intensity: PossessionIntensity | null;
  syncing?: boolean;
}

export function IntensityMeter({ intensity, syncing }: IntensityMeterProps) {
  const active = intensity ? ORDER[intensity] : -1;

  return (
    <div className="intensity-block">
      <div
        className={`intensity-meter ${syncing ? "is-syncing" : ""}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={Math.max(0, active)}
        aria-label="Attack intensity"
      >
        <div className="intensity-track">
          {LEVELS.map((lvl, i) => (
            <div
              key={lvl.id}
              className={`intensity-seg seg-${lvl.id.toLowerCase()} ${
                i <= active ? "is-on" : ""
              } ${i === active ? "is-current" : ""}`}
            >
              <span className="seg-label">{lvl.label}</span>
              <span className="seg-rate">
                +{GAME_CONFIG.POINTS_PER_SECOND[lvl.id]}/s
              </span>
              {i === active && <i className="seg-marker" aria-hidden />}
            </div>
          ))}
        </div>
      </div>
      <p className="intensity-legend">
        Hotter attack = more points per second — but the ball is closer to
        turning over.
      </p>
    </div>
  );
}
