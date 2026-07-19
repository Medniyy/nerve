"use client";

/** Official Solana logomark (three skewed bars, #9945FF → #14F195 gradient). */
export function SolanaMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 397.7 311.7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="sol-grad"
          x1="360.879"
          y1="351.455"
          x2="141.213"
          y2="-69.294"
          gradientTransform="matrix(1 0 0 -1 0 314)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        fill="url(#sol-grad)"
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
      />
      <path
        fill="url(#sol-grad)"
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
      />
      <path
        fill="url(#sol-grad)"
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
      />
    </svg>
  );
}

export function SolanaBadge() {
  return (
    <span className="solana-badge flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <SolanaMark className="h-3.5 w-3.5" />
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
        <span className="hidden sm:inline">Powered by </span>
        <span className="text-white/90">Solana</span>
      </span>
    </span>
  );
}
