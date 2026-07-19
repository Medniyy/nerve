"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
}

const STEPS = [
  {
    accent: "text-volt",
    bar: "bg-volt",
    title: "It's a real match",
    body: "NERVE runs on a real football game, minute by minute. Goals, shots and corners come from a live data feed — not a random number generator.",
    visual: "match",
  },
  {
    accent: "text-white",
    bar: "bg-white",
    title: "Your points multiply while nobody scores",
    body: "Tap HOLD to risk 100 virtual points. The big number on screen is your multiplier — it climbs as the match stays goalless. Cash out at 2.5× and those 100 become 250. There is no shared prize pot — only your stake × that number.",
    visual: "climb",
  },
  {
    accent: "text-danger",
    bar: "bg-danger",
    title: "A goal crashes everything",
    body: "The moment anyone scores, the round is over. Still holding? Your 100 points are gone. Tap CASH OUT any time before that to bank your winnings.",
    visual: "crash",
  },
  {
    accent: "text-amber",
    bar: "bg-amber",
    title: "The danger bar is your warning",
    body: "It reads live betting odds. Green means calm. Red means the market smells a goal coming — that's your cue to get out.",
    visual: "weather",
  },
] as const;

/** First-visit ELI5 walkthrough. Reopen any time via the ? button. */
export function Walkthrough({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal
      aria-label="How to play"
    >
      <div className="sheet-up w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl">
        <div className={`h-1.5 ${s.bar}`} />
        <div className="p-6 pb-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            How to play · {step + 1}/{STEPS.length}
          </p>

          <div key={step} className={`walkthrough-visual visual-${s.visual}`} aria-hidden>
            {s.visual === "match" && <><span>FRA</span><strong>0–0</strong><span>ENG</span></>}
            {s.visual === "climb" && <><i className="mini-curve" /><i className="mini-ball">⚽</i><strong>2.47×</strong></>}
            {s.visual === "crash" && <><i className="mini-burst" /><strong>GOAL</strong></>}
            {s.visual === "weather" && <><span>☀</span><i /><span>⚡</span><strong>Goal danger</strong></>}
          </div>

          <h2 key={`t-${step}`} className="ticker-in mt-4 font-display text-2xl uppercase leading-tight text-white">
            {s.title}
          </h2>
          <p key={`b-${step}`} className="ticker-in mt-3 text-[15px] leading-relaxed text-white/70">
            {s.body}
          </p>

          <div className="mt-7 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Step ${i + 1}`}
                  onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6 bg-white" : "w-1.5 bg-white/25"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              {!last && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2 py-2 text-sm text-white/40 transition hover:text-white"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? onClose() : setStep(step + 1))}
                className={`rounded-full px-6 py-3 font-display text-base uppercase tracking-wide transition active:scale-[0.97] ${
                  last
                    ? "cash-glow bg-volt text-pitch"
                    : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                {last ? "Let's play" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
