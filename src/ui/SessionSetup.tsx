"use client";

import { type SessionDurationId } from "@/game/config";
import { DurationPicker } from "@/ui/DurationPicker";

interface SessionSetupProps {
  mode: "replay" | "live";
  liveLabel?: string | null;
  durationId: SessionDurationId;
  onDuration: (id: SessionDurationId) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function SessionSetup({
  mode,
  liveLabel,
  durationId,
  onDuration,
  onConfirm,
  onBack,
}: SessionSetupProps) {
  return (
    <div className="setup-shell grain relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/40">
          {mode === "live" ? "Live fixture" : "Demo match"}
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-wide text-white">
          {mode === "live" && liveLabel ? liveLabel : "Brazil v Argentina"}
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Hold while a team has the ball. Release to lock points. Confirmed
          turnovers wipe only your Current Hold.
        </p>

        <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          Session length
        </h2>
        <div className="mt-3">
          <DurationPicker value={durationId} onChange={onDuration} />
        </div>

        <button type="button" onClick={onConfirm} className="lobby-play mt-8 w-full">
          <span>Connect & play</span>
          <small>Short countdown → live possession</small>
        </button>
        <button type="button" onClick={onBack} className="lobby-help mt-3 w-full">
          ← Back
        </button>
      </div>
    </div>
  );
}
