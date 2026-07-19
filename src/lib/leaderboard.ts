import { GAME_CONFIG } from "@/game/config";

const LEADERBOARD_LOCAL = "nerve-leaderboard-local";

export interface LeaderboardEntry {
  key: string;
  label: string;
  balance: number;
  isGhost?: boolean;
}

export async function submitScore(
  entry: LeaderboardEntry
): Promise<LeaderboardEntry[]> {
  // Always keep local copy
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
      return mergeGhosts(data.entries);
    }
  } catch {
    // degrade silently
  }
  return mergeGhosts(top);
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch("/api/leaderboard");
    if (res.ok) {
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      return mergeGhosts(data.entries);
    }
  } catch {
    // fall through
  }
  return mergeGhosts(readLocal());
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

function mergeGhosts(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const ghosts: LeaderboardEntry[] = GAME_CONFIG.GHOST_NAMES.map((name, i) => ({
    key: `ghost:${name}`,
    label: name,
    balance: 800 + i * 70 + Math.floor(Math.random() * 40),
    isGhost: true,
  }));
  const humans = entries.filter((e) => !e.isGhost);
  return [...humans, ...ghosts]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);
}
