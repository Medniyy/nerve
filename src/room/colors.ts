/** Stable per-seat colors for room rivals (no purple). */
export const ROOM_PLAYER_COLORS = [
  "#38BDF8", // volt
  "#FFB020", // amber
  "#4ADE80", // mint
  "#FF7865", // coral
  "#E2E8F0", // ice
] as const;

export function roomPlayerColor(index: number): string {
  return ROOM_PLAYER_COLORS[index % ROOM_PLAYER_COLORS.length];
}
