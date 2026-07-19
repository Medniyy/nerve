"use client";

import { useState } from "react";
import { BallIcon } from "@/ui/BallIcon";

interface WalkthroughProps {
  onClose: () => void;
}

interface Step {
  emoji: string;
  title: string;
  body: string;
  visual?: "ladder";
}

const STEPS: Step[] = [
  {
    emoji: "⚽",
    title: "A real match is playing",
    body: "One team has the ball. The little ball and flag at the top show you who — live from the real game.",
  },
  {
    emoji: "🔥",
    title: "Attacks get hot",
    body: "The closer a team is to scoring, the hotter it gets. Hotter attack = more points every second.",
    visual: "ladder",
  },
  {
    emoji: "👇",
    title: "Press and HOLD",
    body: "Hold the button while a team attacks and points pile up. The hotter the attack, the faster they pile.",
  },
  {
    emoji: "🔒",
    title: "Let go to keep them",
    body: "Release any time to bank your points into Total Score. Banked points are safe — you can't lose them.",
  },
  {
    emoji: "⚠️",
    title: "Don't get caught holding",
    body: "If the ball turns over while you're still holding, you lose the points you hadn't banked yet. Your Total stays safe.",
  },
  {
    emoji: "🏆",
    title: "Beat the table",
    body: "Everyone plays the same live match. Bank more than the rest to climb the leaderboard.",
  },
];

const LADDER: { label: string; rate: string; cls: string }[] = [
  { label: "Safe", rate: "+1/s", cls: "seg-safe" },
  { label: "Attack", rate: "+2/s", cls: "seg-attack" },
  { label: "Danger", rate: "+4/s", cls: "seg-danger" },
  { label: "High Danger", rate: "+8/s", cls: "seg-highdanger" },
];

export function Walkthrough({ onClose }: WalkthroughProps) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const next = () => (last ? onClose() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="wt-card sheet-up w-full max-w-md rounded-2xl border border-white/10 bg-card p-6">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-volt">
            How to play · {i + 1} / {STEPS.length}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
          >
            Skip
          </button>
        </div>

        {/* Fixed-height body so every step is the same size */}
        <div className="wt-body flex min-h-[15.5rem] flex-col items-center justify-center px-2 py-6 text-center" key={i}>
          <div className="wt-emoji" aria-hidden>
            {step.emoji === "⚽" ? (
              <BallIcon className="wt-ball" />
            ) : (
              step.emoji
            )}
          </div>
          <h2 className="mt-4 font-display text-3xl tracking-wide">{step.title}</h2>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/70">
            {step.body}
          </p>

          {step.visual === "ladder" && (
            <div className="wt-ladder mt-5 grid w-full grid-cols-4 gap-1.5">
              {LADDER.map((l) => (
                <div key={l.label} className={`wt-ladder-seg ${l.cls}`}>
                  <span>{l.label}</span>
                  <strong>{l.rate}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, d) => (
            <span
              key={d}
              className={`h-1.5 rounded-full transition-all ${
                d === i ? "w-5 bg-volt" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* Back always reserves its slot so the blue button is identical on every step */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={back}
            disabled={i === 0}
            className={`wt-back w-24 shrink-0 rounded-xl border border-white/12 px-5 py-3 font-mono text-xs uppercase tracking-[0.15em] text-white/60 hover:text-white ${
              i === 0 ? "invisible" : ""
            }`}
          >
            Back
          </button>
          <button type="button" onClick={next} className="wt-next lobby-play flex-1">
            <span>{last ? "Let’s play" : "Next"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
