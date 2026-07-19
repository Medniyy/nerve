"use client";

/** Tiny inline SVG soccer ball — renders identically on every OS (unlike the ⚽ emoji). */
export function BallIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="16" cy="16" r="15" fill="#F5F7FA" stroke="#0E1626" strokeWidth="1.6" />
      <g stroke="#0E1626" strokeWidth="1.4" strokeLinecap="round">
        <line x1="16" y1="11" x2="16" y2="3.2" />
        <line x1="20.75" y1="14.45" x2="27.2" y2="11.6" />
        <line x1="18.94" y1="20.05" x2="22.4" y2="26.3" />
        <line x1="13.06" y1="20.05" x2="9.6" y2="26.3" />
        <line x1="11.25" y1="14.45" x2="4.8" y2="11.6" />
      </g>
      <polygon
        points="16,11 20.75,14.45 18.94,20.05 13.06,20.05 11.25,14.45"
        fill="#0E1626"
      />
    </svg>
  );
}
