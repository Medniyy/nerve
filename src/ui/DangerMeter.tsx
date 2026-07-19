"use client";

import type { DangerCause, EngineSnapshot } from "@/game/engine";

interface Props {
  level: number;
  zone: EngineSnapshot["dangerZone"];
  cause: DangerCause;
}

const ZONE_META = {
  CALM: {
    icon: "☀",
    label: "Calm",
    advice: "Nothing is brewing. Safe to hold.",
  },
  BUILDING: {
    icon: "◒",
    label: "Heating up",
    advice: "Chances are coming. Stay sharp.",
  },
  CRITICAL: {
    icon: "⚡",
    label: "Goal danger",
    advice: "A goal looks close. Think about cashing out.",
  },
} as const;

export function DangerMeter({ level, zone, cause }: Props) {
  const meta = ZONE_META[zone];
  const width = Math.min(100, Math.max(4, level));
  const calm = zone === "CALM";
  const causeText = calm
    ? "No immediate warning signs — match pressure is low"
    : cause.label;

  return (
    <section className={`weather-card weather-${zone.toLowerCase()}`} aria-live="polite">
      <div className="weather-head">
        <div className="weather-title">
          <span className="weather-icon" aria-hidden>{meta.icon}</span>
          <div>
            <p>Goal weather</p>
            <h2>{meta.label}</h2>
          </div>
        </div>
        <span className="sr-only">Danger reading {Math.round(level)} out of 100</span>
      </div>

      <div className="weather-track" aria-label={`Goal danger ${Math.round(level)} out of 100`}>
        <span className="weather-fill" style={{ transform: `scaleX(${width / 100})` }} />
        <i /><i /><i />
      </div>

      <p className="weather-advice">{meta.advice}</p>
      <div className="weather-cause">
        <span aria-hidden>{calm ? "—" : "↗"}</span>
        <p>{causeText}</p>
      </div>
    </section>
  );
}
