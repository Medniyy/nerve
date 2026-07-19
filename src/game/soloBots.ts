/**
 * Solo-mode AI competitors.
 *
 * Bots watch the SAME possession snapshot the human sees and independently
 * decide when to hold and release — so solo play has a live leaderboard and
 * the "someone is still holding in High Danger" social pressure, without a
 * second human. Purely cosmetic: bots never touch the human's score.
 */

import {
  GAME_CONFIG,
  type PossessionIntensity,
} from "@/game/config";
import type { HoldStatus, PossessionSnapshot } from "@/game/possessionEngine";
import type { RoomPlayer } from "@/room/store";

type Personality = "paperhands" | "balanced" | "diamond";

const INTENSITY_ORDER: Record<PossessionIntensity, number> = {
  Safe: 0,
  Attack: 1,
  Danger: 2,
  HighDanger: 3,
};

/** Per-personality behaviour knobs. */
const PROFILES: Record<
  Personality,
  {
    /** Chance per second of starting a hold when idle and a team is attacking. */
    startPerSec: number;
    /** Intensity at/above which the bot starts getting nervous and may bail. */
    nervousAt: number;
    /** Base chance per second of releasing once nervous. */
    releasePerSec: number;
    /** Greed: keeps holding even at HighDanger (diamonds ride it). */
    greed: number;
  }
> = {
  paperhands: { startPerSec: 1.1, nervousAt: 1, releasePerSec: 1.4, greed: 0.15 },
  balanced: { startPerSec: 0.85, nervousAt: 2, releasePerSec: 0.9, greed: 0.45 },
  diamond: { startPerSec: 0.6, nervousAt: 3, releasePerSec: 0.6, greed: 0.85 },
};

const BOT_ROSTER: { label: string; personality: Personality }[] = [
  { label: "Mara", personality: "diamond" },
  { label: "Kshort", personality: "paperhands" },
  { label: "Tavo", personality: "balanced" },
  { label: "Nix", personality: "paperhands" },
];

interface Bot {
  id: string;
  label: string;
  personality: Personality;
  totalScore: number;
  currentHold: number;
  holding: boolean;
  status: HoldStatus;
}

export class SoloBots {
  private bots: Bot[];
  private lastTs: number | null = null;
  private prevTeam: "home" | "away" | null = null;
  private prevPhase: PossessionSnapshot["phase"] | null = null;
  private readonly rand: () => number;

  constructor(seed = BOT_ROSTER) {
    this.rand = Math.random;
    this.bots = seed.map((b, i) => ({
      id: `bot-${i}-${b.label.toLowerCase()}`,
      label: b.label,
      personality: b.personality,
      totalScore: 0,
      currentHold: 0,
      holding: false,
      status: "WAITING" as HoldStatus,
    }));
  }

  /** Feed each engine snapshot; bots step forward by the elapsed wall time. */
  observe(snap: PossessionSnapshot): void {
    const now = Date.now();
    const dt = this.lastTs == null ? 0 : Math.min(0.5, (now - this.lastTs) / 1000);
    this.lastTs = now;

    // Goal → everyone's hold auto-locks (mirrors the human rule).
    const goalJustHappened =
      snap.phase === "goal_pause" && this.prevPhase !== "goal_pause";
    if (goalJustHappened) {
      this.lockAll();
    }

    // Session ended → auto-lock and freeze.
    if (snap.phase === "ended") {
      this.lockAll();
      this.prevPhase = snap.phase;
      return;
    }

    // Confirmed turnover → any bot still holding loses its current hold.
    const team = snap.possessionTeam;
    const turnover =
      team != null && this.prevTeam != null && team !== this.prevTeam;
    if (turnover) {
      for (const bot of this.bots) {
        if (bot.holding) {
          bot.holding = false;
          bot.currentHold = 0;
          bot.status = "LOST";
        }
      }
    }
    if (team != null) this.prevTeam = team;
    this.prevPhase = snap.phase;

    const canPlay =
      snap.phase === "playing" && !snap.syncing && snap.intensity != null;
    if (!canPlay || dt === 0) return;

    const intensity = snap.intensity!;
    const rank = INTENSITY_ORDER[intensity];
    const rate = GAME_CONFIG.POINTS_PER_SECOND[intensity];

    for (const bot of this.bots) {
      const p = PROFILES[bot.personality];
      if (bot.holding) {
        bot.currentHold += rate * dt;
        // Decide whether to bank now.
        if (rank >= p.nervousAt) {
          // Nervousness scales with how far past their comfort zone we are.
          const over = rank - p.nervousAt + 1;
          const pressure = p.releasePerSec * over * (1 - p.greed);
          if (this.rand() < pressure * dt) {
            bot.totalScore += Math.floor(bot.currentHold);
            bot.currentHold = 0;
            bot.holding = false;
            bot.status = "LOCKED";
          }
        } else if (this.rand() < 0.15 * dt) {
          // Occasionally take safe profit even when calm.
          bot.totalScore += Math.floor(bot.currentHold);
          bot.currentHold = 0;
          bot.holding = false;
          bot.status = "LOCKED";
        }
      } else {
        // Idle: jump on the current attack with a bias toward livelier play.
        const eagerness = p.startPerSec * (0.6 + rank * 0.25);
        if (this.rand() < eagerness * dt) {
          bot.holding = true;
          bot.status = "HOLDING";
        }
      }
    }
  }

  /** Snapshot the bots as leaderboard rows (RoomPlayer-shaped). */
  rows(): RoomPlayer[] {
    const t = Date.now();
    return this.bots.map((b) => ({
      id: b.id,
      label: b.label,
      joinedAt: t,
      lastSeen: t,
      totalScore: Math.floor(b.totalScore),
      currentHold: b.currentHold,
      status: b.status,
      holding: b.holding,
    }));
  }

  private lockAll(): void {
    for (const bot of this.bots) {
      if (bot.holding || bot.currentHold > 0) {
        bot.totalScore += Math.floor(bot.currentHold);
        bot.currentHold = 0;
        bot.holding = false;
        bot.status = "LOCKED";
      }
    }
  }
}
