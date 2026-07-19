import { GAME_CONFIG } from "@/game/config";

const LEADERBOARD_LOCAL = "nerve-leaderboard-local";

export interface LeaderboardEntry {
  key: string;
  label: string;
  balance: number;
}

export async function submitScore(
  entry: LeaderboardEntry
): Promise<LeaderboardEntry[]> {
  const local = readLocal();
  const without = local.filter((e) => e.key !== entry.key);
  without.push(entry);
  without.sort((a, b) => b.balance - a.balance);
  const top = without.slice(0, 20);
  if (typeof window !== "undefined") {
    localStorage.setItem(LEADERBOARD_LOCAL, JSON.stringify(top));
  }

  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      return data.entries;
    }
  } catch {
    // degrade silently
  }
  return top;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch("/api/leaderboard");
    if (res.ok) {
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      return data.entries;
    }
  } catch {
    // fall through
  }
  return readLocal();
}

function readLocal(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEADERBOARD_LOCAL);
    if (!raw) return [];
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

/** @deprecated ghosts removed from primary experience */
export function ghostPlaceholderCount(): number {
  return GAME_CONFIG.SPONSOR_MESSAGES.length;
}
