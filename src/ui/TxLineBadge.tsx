"use client";

export function TxLineBadge() {
  return (
    <span className="txline-badge flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-3 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-volt" aria-hidden />
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
        Powered by <span className="text-white">TxLINE</span> match data
      </span>
    </span>
  );
}
