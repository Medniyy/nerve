import { GAME_CONFIG } from "@/game/config";
import {
  applyEventToDanger,
  createDangerState,
  dangerLevel,
  dangerZone,
  tickDanger,
  type DangerState,
} from "@/game/danger";
import type { MatchEvent, MatchStream } from "@/streams/types";

export type RoundPhase =
  | "waiting" // between rounds / intermission
  | "open" // round live, player can HOLD
  | "holding" // player has staked
  | "crashed"
  | "ended"; // halftime/fulltime auto-cash window closing

export interface Ghost {
  name: string;
  threshold: number;
  cashedOut: boolean;
  cashOutAt: number | null;
  panicked: boolean;
  personality: "paperhands" | "balanced" | "diamond";
}

export interface RoundResult {
  finalMultiplier: number;
  playerJoined: boolean;
  playerCashedOut: boolean;
  playerCashOutAt: number | null;
  playerCaught: boolean;
  playerPayout: number;
  reason: "goal" | "halftime" | "fulltime" | "manual";
  goalTeam?: "home" | "away";
  goalMinute?: number;
  escaped: { name: string; at: number; isGhost: boolean }[];
  caught: { name: string; isGhost: boolean }[];
}

export interface TickerItem {
  id: string;
  text: string;
  ts: number;
}

export interface DangerCause {
  kind: "shot" | "corner" | "odds" | "card" | "match";
  label: string;
  team?: "home" | "away";
  ts: number;
}

export interface EngineSnapshot {
  phase: RoundPhase;
  multiplier: number;
  dangerLevel: number;
  dangerZone: "CALM" | "BUILDING" | "CRITICAL";
  pGoalSoon: number;
  balance: number;
  stake: number;
  holding: boolean;
  matchMinute: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  ghosts: Ghost[];
  ticker: TickerItem[];
  dangerCause: DangerCause;
  roundHistory: { label: string; ok: boolean }[];
  lastResult: RoundResult | null;
  intermissionEndsAt: number | null;
  streamTs: number;
}

export interface EngineOptions {
  balance?: number;
  playerName?: string;
  /** Initial team names shown before the stream reports them */
  homeTeam?: string;
  awayTeam?: string;
  onSnapshot?: (snap: EngineSnapshot) => void;
  now?: () => number;
  /** Optional hooks so replay can pause during intermission */
  onIntermissionStart?: () => void;
  onIntermissionEnd?: () => void;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function randn(): number {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function sampleNormal(mean: number, std: number): number {
  return Math.max(1.05, mean + randn() * std);
}

export class GameEngine {
  private danger: DangerState = createDangerState();
  private phase: RoundPhase = "waiting";
  private multiplier = 1;
  private balance: number;
  private holding = false;
  private stake = 0;
  private matchMinute = 0;
  private homeTeam: string = GAME_CONFIG.DEMO_HOME;
  private awayTeam: string = GAME_CONFIG.DEMO_AWAY;
  private homeScore = 0;
  private awayScore = 0;
  private ghosts: Ghost[] = [];
  private ticker: TickerItem[] = [];
  private dangerCause: DangerCause = {
    kind: "match",
    label: "The match is settling into its rhythm",
    ts: 0,
  };
  private roundHistory: { label: string; ok: boolean }[] = [];
  private lastResult: RoundResult | null = null;
  private intermissionEndsAt: number | null = null;
  private streamTs = 0;
  private lastTickTs: number | null = null;
  private unsub: (() => void) | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private stream: MatchStream | null = null;
  private playerName: string;
  private onSnapshot?: (snap: EngineSnapshot) => void;
  private prevZone: "CALM" | "BUILDING" | "CRITICAL" = "CALM";
  private panicScheduled = false;
  private tickerSeq = 0;
  private wallNow: () => number;
  private onIntermissionStart?: () => void;
  private onIntermissionEnd?: () => void;

  constructor(opts: EngineOptions = {}) {
    this.balance = opts.balance ?? GAME_CONFIG.STARTING_BALANCE;
    this.playerName = opts.playerName ?? "You";
    this.homeTeam = opts.homeTeam ?? GAME_CONFIG.DEMO_HOME;
    this.awayTeam = opts.awayTeam ?? GAME_CONFIG.DEMO_AWAY;
    this.onSnapshot = opts.onSnapshot;
    this.wallNow = opts.now ?? (() => Date.now());
    this.onIntermissionStart = opts.onIntermissionStart;
    this.onIntermissionEnd = opts.onIntermissionEnd;
  }

  attach(stream: MatchStream): void {
    this.detach();
    this.stream = stream;
    this.unsub = stream.subscribe((ev) => this.onEvent(ev));
  }

  start(): void {
    if (!this.stream) throw new Error("No stream attached");
    this.stream.start();
    this.tickTimer = setInterval(
      () => this.wallTick(),
      GAME_CONFIG.TICK_MS
    );
    this.emit();
  }

  stop(): void {
    this.stream?.stop();
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  detach(): void {
    this.stop();
    this.unsub?.();
    this.unsub = null;
    this.stream = null;
  }

  hold(): boolean {
    if (this.phase !== "open" || this.holding) return false;
    const stake = GAME_CONFIG.STAKE;
    if (this.balance < stake) return false;
    this.balance -= stake;
    this.stake = stake;
    this.holding = true;
    this.phase = "holding";
    this.pushTicker(`${this.playerName} is holding`);
    this.emit();
    return true;
  }

  cashOut(): boolean {
    if (this.phase !== "holding" || !this.holding) return false;
    const payout = Math.floor(this.stake * this.multiplier);
    this.balance += payout;
    this.roundHistory.unshift({
      label: `${this.multiplier.toFixed(2)}x`,
      ok: true,
    });
    this.lastResult = {
      finalMultiplier: this.multiplier,
      playerJoined: true,
      playerCashedOut: true,
      playerCashOutAt: this.multiplier,
      playerCaught: false,
      playerPayout: payout,
      reason: "manual",
      escaped: [
        {
          name: this.playerName,
          at: this.multiplier,
          isGhost: false,
        },
        ...this.ghosts
          .filter((g) => g.cashedOut)
          .map((g) => ({
            name: g.name,
            at: g.cashOutAt!,
            isGhost: true,
          })),
      ],
      caught: this.ghosts
        .filter((g) => !g.cashedOut)
        .map((g) => ({ name: g.name, isGhost: true })),
    };
    this.holding = false;
    this.stake = 0;
    this.phase = "open";
    this.pushTicker(
      `${this.playerName} escaped at ${this.multiplier.toFixed(2)}x`
    );
    this.ensureBalanceFloor();
    this.emit();
    return true;
  }

  getSnapshot(): EngineSnapshot {
    const level = dangerLevel(this.danger);
    return {
      phase: this.phase,
      multiplier: this.multiplier,
      dangerLevel: level,
      dangerZone: dangerZone(level),
      pGoalSoon: this.danger.pGoalSoon,
      balance: this.balance,
      stake: this.stake,
      holding: this.holding,
      matchMinute: this.matchMinute,
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      ghosts: this.ghosts.map((g) => ({ ...g })),
      ticker: [...this.ticker],
      dangerCause: { ...this.dangerCause },
      roundHistory: [...this.roundHistory],
      lastResult: this.lastResult,
      intermissionEndsAt: this.intermissionEndsAt,
      streamTs: this.streamTs,
    };
  }

  setBalance(n: number): void {
    this.balance = n;
    this.emit();
  }

  getBalance(): number {
    return this.balance;
  }

  /** Exposed for unit tests — advance game-time tick with fixed danger */
  __testTick(dtSeconds: number, pGoalSoon?: number): void {
    if (pGoalSoon != null) this.danger.pGoalSoon = pGoalSoon;
    this.advanceMultiplier(dtSeconds);
    tickDanger(this.danger, dtSeconds);
    this.checkGhosts();
    this.emit();
  }

  __testStartRound(): void {
    this.beginRound();
  }

  __testCrash(team: "home" | "away" = "home", minute = 67): void {
    this.crash(team, minute);
  }

  __testInjectEvent(ev: MatchEvent): void {
    this.onEvent(ev);
  }

  private wallTick(): void {
    // Wall clock only used to flush intermission → next open if stream quiet
    if (
      this.intermissionEndsAt != null &&
      this.wallNow() >= this.intermissionEndsAt
    ) {
      this.intermissionEndsAt = null;
      this.onIntermissionEnd?.();
      if (this.phase === "crashed") this.phase = "waiting";
      // Round opens after intermission mid-match so player can HOLD again.
      if (this.matchMinute > 0 && this.matchMinute < 90) {
        this.beginRound();
      } else {
        this.emit();
      }
    }
  }

  private onEvent(ev: MatchEvent): void {
    if (this.lastTickTs != null && ev.ts > this.lastTickTs) {
      const dt = (ev.ts - this.lastTickTs) / 1000;
      // Subdivide large jumps so multiplier growth stays stable at high replay speeds
      const steps = Math.max(1, Math.ceil(dt / (GAME_CONFIG.TICK_MS / 1000)));
      const stepDt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.advanceMultiplier(stepDt);
        tickDanger(this.danger, stepDt);
        this.checkGhosts();
      }
    }
    this.lastTickTs = ev.ts;
    this.streamTs = ev.ts;

    if (ev.matchMinute != null) this.matchMinute = ev.matchMinute;
    if (ev.homeTeam) this.homeTeam = ev.homeTeam;
    if (ev.awayTeam) this.awayTeam = ev.awayTeam;
    if (ev.homeScore != null) this.homeScore = ev.homeScore;
    if (ev.awayScore != null) this.awayScore = ev.awayScore;

    applyEventToDanger(this.danger, ev);
    this.updateDangerCause(ev);

    switch (ev.type) {
      case "kickoff":
        this.beginRound();
        break;
      case "goal":
        if (ev.team === "home") this.homeScore += 1;
        else if (ev.team === "away") this.awayScore += 1;
        this.crash(ev.team ?? "home", ev.matchMinute ?? this.matchMinute);
        break;
      case "halftime":
        this.endSafe("halftime");
        break;
      case "fulltime":
        this.endSafe("fulltime");
        break;
      default:
        break;
    }

    // Zone transition panic for ghosts
    const zone = dangerZone(dangerLevel(this.danger));
    if (
      zone === "CRITICAL" &&
      this.prevZone !== "CRITICAL" &&
      (this.phase === "open" || this.phase === "holding")
    ) {
      this.schedulePanicCash();
    }
    this.prevZone = zone;
    this.emit();
  }

  private advanceMultiplier(dtSeconds: number): void {
    if (this.phase !== "open" && this.phase !== "holding") return;
    const danger = clamp(
      this.danger.pGoalSoon / GAME_CONFIG.P_REF,
      GAME_CONFIG.DANGER_MIN,
      GAME_CONFIG.DANGER_MAX
    );
    const growth = GAME_CONFIG.BASE_GROWTH * danger;
    this.multiplier *= 1 + growth * dtSeconds;
  }

  private beginRound(): void {
    this.multiplier = 1;
    this.holding = false;
    this.stake = 0;
    this.phase = "open";
    this.lastResult = null;
    this.intermissionEndsAt = null;
    this.panicScheduled = false;
    this.spawnGhosts();
    this.pushTicker("Round open — HOLD to join");
  }

  private spawnGhosts(): void {
    const personalities: Ghost["personality"][] = [
      "paperhands",
      "balanced",
      "balanced",
      "diamond",
    ];
    this.ghosts = GAME_CONFIG.GHOST_NAMES.map((name, i) => {
      const personality = personalities[i] ?? "balanced";
      const dist = GAME_CONFIG.GHOST_PERSONALITIES[personality];
      return {
        name,
        personality,
        threshold: sampleNormal(dist.mean, dist.std),
        cashedOut: false,
        cashOutAt: null,
        panicked: false,
      };
    });
  }

  private checkGhosts(): void {
    if (this.phase !== "open" && this.phase !== "holding") return;
    for (const g of this.ghosts) {
      if (g.cashedOut) continue;
      if (this.multiplier >= g.threshold) {
        g.cashedOut = true;
        g.cashOutAt = this.multiplier;
        this.pushTicker(
          `${g.name} cashed out at ${this.multiplier.toFixed(2)}x`
        );
      }
    }
  }

  private schedulePanicCash(): void {
    if (this.panicScheduled) return;
    this.panicScheduled = true;
    for (const g of this.ghosts) {
      if (g.cashedOut) continue;
      if (Math.random() < GAME_CONFIG.GHOST_PANIC_CHANCE) {
        // Approximate immediate panic within window by cashing now at high speed
        // (replay may jump more than 2s between events)
        g.cashedOut = true;
        g.cashOutAt = this.multiplier;
        g.panicked = true;
        this.pushTicker(
          `${g.name} panic-cashed at ${this.multiplier.toFixed(2)}x`
        );
      }
    }
  }

  private crash(team: "home" | "away", minute: number): void {
    if (this.phase === "crashed" || this.phase === "waiting") {
      // Still record score events mid-intermission without re-crashing
      return;
    }
    const playerJoined = this.holding || this.phase === "holding";
    const playerCaught = this.holding;
    if (playerCaught) {
      this.roundHistory.unshift({ label: "CRASHED", ok: false });
    }

    const escaped = [
      ...(this.holding
        ? []
        : this.lastResult?.playerCashedOut
          ? [
              {
                name: this.playerName,
                at: this.lastResult.playerCashOutAt!,
                isGhost: false,
              },
            ]
          : []),
      ...this.ghosts
        .filter((g) => g.cashedOut)
        .map((g) => ({
          name: g.name,
          at: g.cashOutAt!,
          isGhost: true,
        })),
    ];

    // If player cashed earlier this round, keep that; else if holding → caught
    const alreadyCashed =
      this.lastResult?.playerCashedOut &&
      this.lastResult.reason === "manual";

    this.lastResult = {
      finalMultiplier: this.multiplier,
      playerJoined: playerJoined || !!alreadyCashed,
      playerCashedOut: !!alreadyCashed,
      playerCashOutAt: alreadyCashed
        ? this.lastResult!.playerCashOutAt
        : null,
      playerCaught,
      playerPayout: alreadyCashed ? this.lastResult!.playerPayout : 0,
      reason: "goal",
      goalTeam: team,
      goalMinute: minute,
      escaped,
      caught: [
        ...(playerCaught
          ? [{ name: this.playerName, isGhost: false }]
          : []),
        ...this.ghosts
          .filter((g) => !g.cashedOut)
          .map((g) => ({ name: g.name, isGhost: true })),
      ],
    };

    this.holding = false;
    this.stake = 0;
    this.phase = "crashed";
    this.intermissionEndsAt =
      this.wallNow() + GAME_CONFIG.INTERMISSION_MS;
    this.onIntermissionStart?.();
    this.ensureBalanceFloor();
    this.pushTicker(
      `GOAL — ${minute}' ${team === "home" ? this.homeTeam : this.awayTeam}`
    );
  }

  private endSafe(reason: "halftime" | "fulltime"): void {
    if (this.phase !== "open" && this.phase !== "holding") return;
    let payout = 0;
    if (this.holding) {
      payout = Math.floor(this.stake * this.multiplier);
      this.balance += payout;
      this.roundHistory.unshift({
        label: `${this.multiplier.toFixed(2)}x`,
        ok: true,
      });
      this.pushTicker(
        `Whistle — auto-cashed at ${this.multiplier.toFixed(2)}x`
      );
    }
    this.lastResult = {
      finalMultiplier: this.multiplier,
      playerJoined: this.holding,
      playerCashedOut: this.holding,
      playerCashOutAt: this.holding ? this.multiplier : null,
      playerCaught: false,
      playerPayout: payout,
      reason,
      escaped: [
        ...(this.holding
          ? [
              {
                name: this.playerName,
                at: this.multiplier,
                isGhost: false,
              },
            ]
          : []),
        ...this.ghosts
          .filter((g) => g.cashedOut)
          .map((g) => ({
            name: g.name,
            at: g.cashOutAt!,
            isGhost: true,
          })),
      ],
      caught: this.ghosts
        .filter((g) => !g.cashedOut)
        .map((g) => ({ name: g.name, isGhost: true })),
    };
    this.holding = false;
    this.stake = 0;
    this.phase = "waiting";
    this.ensureBalanceFloor();
    if (reason === "halftime") {
      this.intermissionEndsAt =
        this.wallNow() + GAME_CONFIG.INTERMISSION_MS;
    }
  }

  private ensureBalanceFloor(): void {
    if (this.balance < GAME_CONFIG.BALANCE_FLOOR) {
      this.balance = GAME_CONFIG.BALANCE_FLOOR;
    }
  }

  private updateDangerCause(ev: MatchEvent): void {
    const teamName =
      ev.team === "home"
        ? this.homeTeam
        : ev.team === "away"
          ? this.awayTeam
          : null;

    if (ev.type === "shot") {
      this.dangerCause = {
        kind: "shot",
        label: `${teamName ?? "A team"} gets a shot away — danger rising`,
        team: ev.team,
        ts: ev.ts,
      };
    } else if (ev.type === "corner") {
      this.dangerCause = {
        kind: "corner",
        label: `Corner to ${teamName ?? "the attacking side"} — pressure building`,
        team: ev.team,
        ts: ev.ts,
      };
    } else if (ev.type === "odds" && ev.odds) {
      const rising = ev.odds.drift > 0.002;
      this.dangerCause = {
        kind: "odds",
        label: rising
          ? "The goal market is tightening — chances are coming"
          : "The goal market has eased — the moment looks calmer",
        ts: ev.ts,
      };
    } else if (ev.type === "card") {
      this.dangerCause = {
        kind: "card",
        label: `${teamName ?? "A player"} sees a card — the game is opening up`,
        team: ev.team,
        ts: ev.ts,
      };
    } else if (ev.type === "kickoff") {
      this.dangerCause = {
        kind: "match",
        label: "Kick-off — both sides are feeling their way in",
        ts: ev.ts,
      };
    }
  }

  private pushTicker(text: string): void {
    this.tickerSeq += 1;
    this.ticker.unshift({
      id: `${this.tickerSeq}`,
      text,
      ts: this.streamTs,
    });
    this.ticker = this.ticker.slice(0, 40);
  }

  private emit(): void {
    this.onSnapshot?.(this.getSnapshot());
  }
}
