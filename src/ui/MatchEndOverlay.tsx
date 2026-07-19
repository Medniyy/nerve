"use client";

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  balance: number;
  onPlayAgain: () => void;
  onLobby: () => void;
}

/** Shown at full time — the replay is over, offer a clean next step. */
export function MatchEndOverlay({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  balance,
  onPlayAgain,
  onLobby,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="sheet-up w-full max-w-sm rounded-3xl border border-white/10 bg-card p-6 pb-7 text-center shadow-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          Full time
        </p>
        <p className="mt-2 font-display text-2xl text-white">
          {homeTeam} {homeScore}
          <span className="mx-2 text-white/30">–</span>
          {awayScore} {awayTeam}
        </p>

        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          Your balance
        </p>
        <p className="mt-1 font-display text-5xl tabular-nums text-volt">
          {balance}
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="cash-glow w-full rounded-full bg-volt px-6 py-4 font-display text-xl uppercase tracking-wide text-pitch transition hover:brightness-110 active:scale-[0.98]"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onLobby}
            className="w-full rounded-full border border-white/15 bg-white/5 px-6 py-3.5 font-display text-base uppercase tracking-wide text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
          >
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}
