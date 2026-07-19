"use client";

interface SessionResultsProps {
  totalScore: number;
  personalBest: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  isNewBest: boolean;
  onAgain: () => void;
  onLobby: () => void;
}

export function SessionResults({
  totalScore,
  personalBest,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  isNewBest,
  onAgain,
  onLobby,
}: SessionResultsProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          Session over
        </p>
        <h2 className="mt-2 font-display text-5xl tracking-wide text-volt">
          {totalScore.toLocaleString()}
        </h2>
        <p className="mt-1 text-sm text-white/55">Total Score</p>
        {isNewBest && (
          <p className="mt-3 font-mono text-xs uppercase tracking-widest text-amber">
            New personal best
          </p>
        )}
        <p className="mt-4 font-mono text-xs text-white/40">
          Best · {personalBest.toLocaleString()} pts
        </p>
        <p className="mt-6 text-sm text-white/70">
          {homeTeam} {homeScore}–{awayScore} {awayTeam}
        </p>
        <button type="button" onClick={onAgain} className="lobby-play mt-6 w-full">
          <span>Play another</span>
        </button>
        <button type="button" onClick={onLobby} className="lobby-help mt-2 w-full">
          Quit to main menu
        </button>
      </div>
    </div>
  );
}
