/**
 * Pure possession-based scoring engine.
 * Total Score is locked forever; Current Hold is unbanked while pressing HOLD.
 */

import {
  GAME_CONFIG,
  type PossessionIntensity,
  type SessionDurationId,
} from "@/game/config";
import type { MatchEvent, MatchStream } from "@/streams/types";

export type SessionPhase =
  | "connecting"
  | "playing"
  | "goal_pause"
  | "syncing"
  | "ended";

export type HoldStatus = "WAITING" | "HOLDING" | "LOCKED" | "LOST";

export interface PossessionSnapshot {
  phase: SessionPhase;
  totalScore: number;
  currentHold: number;
  holding: boolean;
  holdStatus: HoldStatus;
  pointsPerSecond: number;
  intensity: PossessionIntensity | null;
  possessionTeam: "home" | "away" | null;
  possessionLabel: string;
  matchMinute: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  sessionRemainingMs: number | null;
  sessionElapsedMs: number;
  sessionDurationId: SessionDurationId;
  goalFlash: { team: "home" | "away"; locked: number } | null;
  syncing: boolean;
  holdEnabled: boolean;
  streamTs: number;
  lastLockedAmount: number | null;
  lastLostAmount: number | null;
}

export interface PossessionEngineOptions {
  sessionDurationId?: SessionDurationId;
  sessionDurationMs?: number | null;
  /** When set, skip connecting countdown and use this as session start */
  sessionStartedAt?: number;
  homeTeam?: string;
  awayTeam?: string;
  onSnapshot?: (snap: PossessionSnapshot) => void;
  /** Prefer server/stream time; injectable for tests */
  now?: () => number;
  /**
   * When true, caller drives ticks via __testTick / external loop.
   * Used by server-authoritative room sessions.
   */
  externalTick?: boolean;
}

interface PendingTurnover {
  team: "home" | "away";
  firstSeenTs: number;
  count: number;
}

function intensityRate(intensity: PossessionIntensity | null): number {
  if (!intensity) return 0;
  return GAME_CONFIG.POINTS_PER_SECOND[intensity];
}

function resolveDurationMs(
  id: SessionDurationId,
  override?: number | null
): number | null {
  if (override !== undefined) return override;
  const found = GAME_CONFIG.SESSION_DURATIONS.find((d) => d.id === id);
  return found?.ms ?? null;
}

export class PossessionEngine {
  private stream: MatchStream | null = null;
  private unsub: (() => void) | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly onSnapshot?: (snap: PossessionSnapshot) => void;

  private phase: SessionPhase = "connecting";
  private totalScore = 0;
  private currentHold = 0;
  private holding = false;
  private holdStatus: HoldStatus = "WAITING";
  private holdStartedAt: number | null = null;
  private holdAccruedBeforeTick = 0;

  private intensity: PossessionIntensity | null = null;
  private possessionTeam: "home" | "away" | null = null;
  private confirmedTeam: "home" | "away" | null = null;
  private pendingTurnover: PendingTurnover | null = null;
  private lastPossessionTs: number | null = null;

  private matchMinute = 0;
  private homeTeam: string;
  private awayTeam: string;
  private homeScore = 0;
  private awayScore = 0;

  private sessionDurationId: SessionDurationId;
  private sessionDurationMs: number | null;
  private sessionStartedAt: number | null = null;
  private sessionEndedAt: number | null = null;
  private goalPauseUntil: number | null = null;
  private goalFlash: { team: "home" | "away"; locked: number } | null = null;
  private streamTs = 0;
  private lastLockedAmount: number | null = null;
  private lastLostAmount: number | null = null;
  private connectUntil: number | null = null;
  private readonly externalTick: boolean;

  constructor(opts: PossessionEngineOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.onSnapshot = opts.onSnapshot;
    this.externalTick = Boolean(opts.externalTick);
    this.homeTeam = opts.homeTeam ?? GAME_CONFIG.DEMO_HOME;
    this.awayTeam = opts.awayTeam ?? GAME_CONFIG.DEMO_AWAY;
    this.sessionDurationId = opts.sessionDurationId ?? "5m";
    this.sessionDurationMs = resolveDurationMs(
      this.sessionDurationId,
      opts.sessionDurationMs
    );
    if (opts.sessionStartedAt != null) {
      this.beginPlaying(opts.sessionStartedAt);
    }
  }

  attach(stream: MatchStream): void {
    this.detach();
    this.stream = stream;
    this.unsub = stream.subscribe((ev) => this.onEvent(ev));
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.stream?.stop();
    this.stream = null;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  start(): void {
    const t = this.now();
    this.connectUntil = t + GAME_CONFIG.CONNECT_COUNTDOWN_MS;
    this.phase = "connecting";
    this.sessionStartedAt = null;
    this.emit();
    this.stream?.start();
    if (!this.externalTick) {
      this.tickTimer = setInterval(() => this.tick(), GAME_CONFIG.TICK_MS);
    }
  }

  /** Begin session immediately (skip countdown) — tests / room servers */
  startImmediate(at?: number): void {
    this.connectUntil = null;
    this.beginPlaying(at ?? this.now());
    this.stream?.start();
    if (!this.externalTick && !this.tickTimer) {
      this.tickTimer = setInterval(() => this.tick(), GAME_CONFIG.TICK_MS);
    }
  }

  private beginPlaying(t: number): void {
    this.phase = this.possessionTeam ? "playing" : "syncing";
    this.sessionStartedAt = t;
    if (this.sessionDurationMs != null) {
      this.sessionEndedAt = t + this.sessionDurationMs;
    } else {
      this.sessionEndedAt = null;
    }
    this.emit();
  }

  holdStart(): void {
    if (!this.canHold()) return;
    if (this.holding) return;
    this.settleHoldAccrual(this.now());
    this.holding = true;
    this.holdStatus = "HOLDING";
    this.holdStartedAt = this.now();
    this.holdAccruedBeforeTick = this.currentHold;
    this.lastLostAmount = null;
    this.lastLockedAmount = null;
    this.emit();
  }

  holdRelease(): void {
    if (!this.holding) return;
    this.settleHoldAccrual(this.now());
    const locked = this.currentHold;
    this.totalScore += locked;
    this.currentHold = 0;
    this.holding = false;
    this.holdStartedAt = null;
    this.holdAccruedBeforeTick = 0;
    this.holdStatus = "LOCKED";
    this.lastLockedAmount = locked;
    this.lastLostAmount = null;
    this.emit();
  }

  /** Cancel active hold without locking (reconnect / interrupted) */
  cancelHold(): void {
    if (!this.holding) return;
    const lost = this.currentHold;
    this.currentHold = 0;
    this.holding = false;
    this.holdStartedAt = null;
    this.holdAccruedBeforeTick = 0;
    this.holdStatus = lost > 0 ? "LOST" : "WAITING";
    this.lastLostAmount = lost > 0 ? lost : null;
    this.emit();
  }

  getSnapshot(): PossessionSnapshot {
    return this.buildSnapshot();
  }

  /** Force the session to end now (e.g. the replay feed ran out). */
  finish(): void {
    this.endSession(this.now());
    this.emit();
  }

  /** Restore locked total after reconnect (solo local or room hydrate) */
  restoreTotalScore(score: number): void {
    this.totalScore = Math.max(0, Math.floor(score));
    this.emit();
  }

  // ─── Test hooks ─────────────────────────────────────────

  __testInjectEvent(ev: MatchEvent): void {
    this.onEvent(ev);
  }

  __testTick(at?: number): void {
    if (at != null) {
      const prev = this.now;
      (this as unknown as { now: () => number }).now = () => at;
      this.tick();
      (this as unknown as { now: () => number }).now = prev;
    } else {
      this.tick();
    }
  }

  __testSetPossession(
    team: "home" | "away" | null,
    intensity: PossessionIntensity | null,
    ts?: number
  ): void {
    const wall = ts ?? this.now();
    this.applyPossessionUpdate(team, intensity, wall, wall);
  }

  // ─── Internals ──────────────────────────────────────────

  private canHold(): boolean {
    if (this.phase === "ended" || this.phase === "connecting") return false;
    if (this.phase === "goal_pause") return false;
    if (this.syncing()) return false;
    return true;
  }

  private syncing(): boolean {
    if (this.phase === "syncing") return true;
    if (this.possessionTeam == null || this.intensity == null) return true;
    if (this.lastPossessionTs == null) return true;
    const age = this.now() - this.lastPossessionTs;
    return age > GAME_CONFIG.POSSESSION_STALE_MS;
  }

  private settleHoldAccrual(t: number, opts?: { ignorePause?: boolean }): void {
    if (!this.holding || this.holdStartedAt == null) return;
    if (
      !opts?.ignorePause &&
      (this.phase === "goal_pause" || this.phase === "ended")
    ) {
      return;
    }

    const rate = intensityRate(this.intensity);
    if (rate <= 0) return;

    // Accrue only while possession was fresh
    let end = t;
    if (this.lastPossessionTs != null) {
      const staleAt = this.lastPossessionTs + GAME_CONFIG.POSSESSION_STALE_MS;
      end = Math.min(end, staleAt);
    }
    if (this.goalPauseUntil != null) {
      // shouldn't accrue into goal pause from earlier start
    }

    const elapsedSec = Math.max(0, (end - this.holdStartedAt) / 1000);
    this.currentHold = this.holdAccruedBeforeTick + elapsedSec * rate;
  }

  private loseCurrentHold(): void {
    if (!this.holding && this.currentHold <= 0) {
      this.holdStatus = "WAITING";
      return;
    }
    const lost = this.currentHold;
    this.currentHold = 0;
    this.holding = false;
    this.holdStartedAt = null;
    this.holdAccruedBeforeTick = 0;
    this.holdStatus = "LOST";
    this.lastLostAmount = lost;
    this.lastLockedAmount = null;
  }

  private lockCurrentHoldForGoal(): number {
    this.settleHoldAccrual(this.now());
    const locked = this.currentHold;
    if (locked > 0 || this.holding) {
      this.totalScore += locked;
      this.currentHold = 0;
      this.holding = false;
      this.holdStartedAt = null;
      this.holdAccruedBeforeTick = 0;
      this.holdStatus = "LOCKED";
      this.lastLockedAmount = locked;
    }
    return locked;
  }

  private onEvent(ev: MatchEvent): void {
    const streamTs = ev.serverTs ?? ev.ts ?? this.now();
    const wall = this.now();
    this.streamTs = streamTs;

    if (ev.homeTeam) this.homeTeam = ev.homeTeam;
    if (ev.awayTeam) this.awayTeam = ev.awayTeam;
    if (typeof ev.homeScore === "number") this.homeScore = ev.homeScore;
    if (typeof ev.awayScore === "number") this.awayScore = ev.awayScore;
    if (typeof ev.matchMinute === "number") this.matchMinute = ev.matchMinute;

    if (
      ev.possessionTeam !== undefined ||
      ev.possessionIntensity !== undefined ||
      ev.type === "possession"
    ) {
      const team =
        ev.possessionTeam !== undefined
          ? ev.possessionTeam
          : this.possessionTeam;
      const intensity =
        ev.possessionIntensity !== undefined
          ? ev.possessionIntensity
          : this.intensity;
      this.applyPossessionUpdate(team ?? null, intensity ?? null, wall, streamTs);
    }

    if (ev.type === "goal") {
      this.onGoal(ev.team ?? "home", wall);
    }

    if (ev.type === "fulltime" && this.sessionDurationMs == null) {
      this.endSession(wall);
    }

    this.emit();
  }

  private applyPossessionUpdate(
    team: "home" | "away" | null,
    intensity: PossessionIntensity | null,
    wallTs: number,
    streamTs?: number
  ): void {
    void streamTs;
    if (team == null) {
      this.possessionTeam = null;
      this.intensity = intensity;
      this.lastPossessionTs = wallTs;
      if (this.phase === "playing") this.phase = "syncing";
      this.settleHoldAccrual(wallTs);
      if (this.holding) {
        this.holdAccruedBeforeTick = this.currentHold;
        this.holdStartedAt = wallTs;
      }
      return;
    }

    const sameConfirmed = this.confirmedTeam === team;
    const firstPossession = this.confirmedTeam == null && !this.pendingTurnover;
    if (sameConfirmed || firstPossession) {
      this.settleHoldAccrual(wallTs);
      if (this.holding) {
        this.holdAccruedBeforeTick = this.currentHold;
        this.holdStartedAt = wallTs;
      }
      this.possessionTeam = team;
      if (intensity) this.intensity = intensity;
      this.lastPossessionTs = wallTs;
      this.pendingTurnover = null;
      if (!this.confirmedTeam) this.confirmedTeam = team;
      if (this.phase === "syncing" || this.phase === "playing") {
        this.phase = "playing";
      }
      return;
    }

    // Potential turnover
    if (!this.confirmedTeam) {
      this.confirmedTeam = team;
      this.possessionTeam = team;
      this.intensity = intensity ?? "Safe";
      this.lastPossessionTs = wallTs;
      this.pendingTurnover = null;
      if (this.phase === "syncing") this.phase = "playing";
      return;
    }

    if (!this.pendingTurnover || this.pendingTurnover.team !== team) {
      this.pendingTurnover = { team, firstSeenTs: wallTs, count: 1 };
      this.possessionTeam = team;
      if (intensity) this.intensity = intensity;
      this.lastPossessionTs = wallTs;
      return;
    }

    this.pendingTurnover.count += 1;
    this.possessionTeam = team;
    if (intensity) this.intensity = intensity;
    this.lastPossessionTs = wallTs;

    const stableLongEnough =
      wallTs - this.pendingTurnover.firstSeenTs >= GAME_CONFIG.TURNOVER_STABLE_MS;
    const enoughUpdates =
      this.pendingTurnover.count >= GAME_CONFIG.TURNOVER_CONFIRM_UPDATES;

    if (stableLongEnough || enoughUpdates) {
      this.confirmTurnover(team, intensity ?? this.intensity ?? "Safe", wallTs);
    }
  }

  private confirmTurnover(
    team: "home" | "away",
    intensity: PossessionIntensity,
    wallTs: number
  ): void {
    this.settleHoldAccrual(wallTs);
    if (this.holding || this.currentHold > 0) {
      this.loseCurrentHold();
    }
    this.confirmedTeam = team;
    this.possessionTeam = team;
    this.intensity = intensity;
    this.pendingTurnover = null;
    this.lastPossessionTs = wallTs;
    if (this.phase === "syncing") this.phase = "playing";
  }

  private onGoal(team: "home" | "away", wallTs: number): void {
    const locked = this.lockCurrentHoldForGoal();
    this.goalFlash = { team, locked };
    this.goalPauseUntil = wallTs + GAME_CONFIG.GOAL_PAUSE_MS;
    this.phase = "goal_pause";
    this.possessionTeam = null;
    this.confirmedTeam = null;
    this.pendingTurnover = null;
    this.intensity = null;
  }

  private endSession(t: number): void {
    if (this.phase === "ended") return;
    this.settleHoldAccrual(t, { ignorePause: true });
    if (this.holding || this.currentHold > 0) {
      // Auto-lock at session end
      this.totalScore += this.currentHold;
      this.lastLockedAmount = this.currentHold;
      this.currentHold = 0;
      this.holding = false;
      this.holdStartedAt = null;
      this.holdAccruedBeforeTick = 0;
      this.holdStatus = "LOCKED";
    }
    this.phase = "ended";
    this.sessionEndedAt = t;
  }

  private tick(): void {
    const t = this.now();

    if (this.phase === "connecting" && this.connectUntil != null) {
      if (t >= this.connectUntil) {
        this.beginPlaying(t);
      } else {
        this.emit();
        return;
      }
    }

    if (this.phase === "goal_pause" && this.goalPauseUntil != null) {
      if (t >= this.goalPauseUntil) {
        this.goalPauseUntil = null;
        this.goalFlash = null;
        this.phase = this.possessionTeam ? "playing" : "syncing";
      }
    }

    // Confirm turnover by stability even without a second update
    if (
      this.pendingTurnover &&
      this.confirmedTeam &&
      this.pendingTurnover.team !== this.confirmedTeam
    ) {
      if (t - this.pendingTurnover.firstSeenTs >= GAME_CONFIG.TURNOVER_STABLE_MS) {
        this.confirmTurnover(
          this.pendingTurnover.team,
          this.intensity ?? "Safe",
          t
        );
      }
    }

    if (this.syncing() && this.phase === "playing") {
      this.settleHoldAccrual(t);
      if (this.holding) {
        this.holdAccruedBeforeTick = this.currentHold;
        this.holdStartedAt = t;
      }
      this.phase = "syncing";
    } else if (
      !this.syncing() &&
      this.phase === "syncing" &&
      this.possessionTeam
    ) {
      this.phase = "playing";
    }

    if (this.holding && this.phase === "playing" && !this.syncing()) {
      this.settleHoldAccrual(t);
    }

    if (
      this.sessionStartedAt != null &&
      this.sessionDurationMs != null &&
      this.phase !== "ended" &&
      this.phase !== "connecting"
    ) {
      const end = this.sessionStartedAt + this.sessionDurationMs;
      if (t >= end) {
        this.endSession(t);
      }
    }

    this.emit();
  }

  private buildSnapshot(): PossessionSnapshot {
    const t = this.now();
    let remaining: number | null = null;
    let elapsed = 0;
    if (this.sessionStartedAt != null) {
      elapsed = Math.max(0, t - this.sessionStartedAt);
      if (this.sessionDurationMs != null) {
        remaining = Math.max(0, this.sessionDurationMs - elapsed);
      }
    }

    const syncing = this.syncing() || this.phase === "syncing";
    const teamName =
      this.possessionTeam === "home"
        ? this.homeTeam
        : this.possessionTeam === "away"
          ? this.awayTeam
          : null;

    return {
      phase: this.phase,
      totalScore: Math.floor(this.totalScore),
      currentHold: Math.floor(this.currentHold * 10) / 10,
      holding: this.holding,
      holdStatus: this.holdStatus,
      pointsPerSecond: syncing ? 0 : intensityRate(this.intensity),
      intensity: this.intensity,
      possessionTeam: this.possessionTeam,
      possessionLabel: teamName
        ? `${teamName.toUpperCase()} IN POSSESSION`
        : "SYNCING LIVE POSSESSION",
      matchMinute: this.matchMinute,
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      sessionRemainingMs: remaining,
      sessionElapsedMs: elapsed,
      sessionDurationId: this.sessionDurationId,
      goalFlash: this.goalFlash,
      syncing,
      holdEnabled: this.canHold(),
      streamTs: this.streamTs,
      lastLockedAmount: this.lastLockedAmount,
      lastLostAmount: this.lastLostAmount,
    };
  }

  private emit(): void {
    this.onSnapshot?.(this.buildSnapshot());
  }
}
