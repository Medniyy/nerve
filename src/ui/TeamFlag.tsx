"use client";

import { teamBadge, teamFlagCode } from "@/lib/flags";

interface TeamFlagProps {
  team: string | undefined | null;
  className?: string;
}

/** Small SVG flag (renders identically on every OS) with a code-badge fallback. */
export function TeamFlag({ team, className = "" }: TeamFlagProps) {
  const code = teamFlagCode(team);
  if (code) {
    return (
      <span
        className={`fi fi-${code} team-flag ${className}`}
        role="img"
        aria-label={team ?? "flag"}
      />
    );
  }
  return (
    <span className={`team-badge ${className}`} aria-hidden>
      {teamBadge(team)}
    </span>
  );
}
