import { GAME_CONFIG } from "@/game/config";
import type { MatchEvent, OddsSnapshot } from "@/streams/types";

/**
 * Danger / pGoalSoon derivation.
 * Preference order (spec §3.2):
 * 1. Next-goal / short-horizon goal market implied probability
 * 2. Over/under totals movement
 * 3. Event-intensity fallback (always available behind config flag)
 */

export interface DangerState {
  pGoalSoon: number;
  drift: number;
  smoothed: number; // EMA of pGoalSoon for meter display (0..1)
  spike: number; // temporary 0..100 spike contribution
  lastOddsP: number | null;
  lastOddsTs: number | null;
  intensityEvents: { ts: number; weight: number }[];
}

export function createDangerState(): DangerState {
  return {
    pGoalSoon: 0.05,
    drift: 0,
    smoothed: 0.05,
    spike: 0,
    lastOddsP: null,
    lastOddsTs: null,
    intensityEvents: [],
  };
}

/** Convert decimal odds → implied probability, normalize for overround when multiple legs. */
export function impliedFromDecimals(decimals: number[]): number {
  const raw = decimals.map((d) => (d > 1 ? 1 / d : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  // Return first selection's fair probability if multi-way; for yes/no next-goal use Yes leg.
  return raw[0] / sum;
}

/**
 * Prefer TxLINE StablePrice `Pct` (demargined %) when present.
 * Prices in OpenAPI are integers — treat as decimal odds × 1000 when Pct absent.
 */
export function pFromOddsPayload(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const superType = String(o.SuperOddsType ?? o.superOddsType ?? "").toLowerCase();
  const marketParams = String(o.MarketParameters ?? o.marketParameters ?? "");
  const priceNames = (o.PriceNames ?? o.priceNames) as string[] | undefined;
  const prices = (o.Prices ?? o.prices) as number[] | undefined;
  const pct = (o.Pct ?? o.pct) as string[] | undefined;

  const isNextGoal =
    superType.includes("nextgoal") ||
    superType.includes("next_goal") ||
    superType.includes("next goal") ||
    superType.includes("team to score next");

  const isOverUnder =
    superType.includes("overunder") ||
    superType.includes("over_under") ||
    superType.includes("total") ||
    marketParams.toLowerCase().includes("total");

  // Prefer demargined Pct for goal-relevant markets
  if (pct && pct.length > 0) {
    const parsePct = (s: string) => {
      if (!s || s === "NA") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n / 100 : null;
    };

    if (isNextGoal) {
      // Prefer "Yes" / home-next / first named outcome as goal-soon proxy
      let idx = 0;
      if (priceNames) {
        const yesIdx = priceNames.findIndex((n) => /yes/i.test(n));
        if (yesIdx >= 0) idx = yesIdx;
      }
      const p = parsePct(pct[idx] ?? pct[0]);
      if (p != null) return clamp01(p);
    }

    if (isOverUnder) {
      // Shortening "Over" ⇒ rising pGoalSoon — use Over percentage
      let overIdx = 0;
      if (priceNames) {
        const oi = priceNames.findIndex((n) => /over/i.test(n));
        if (oi >= 0) overIdx = oi;
      }
      const p = parsePct(pct[overIdx] ?? pct[0]);
      // Map over-probability into a softer short-horizon goal proxy
      if (p != null) return clamp01(p * 0.35);
    }
  }

  if (prices && prices.length > 0) {
    // Prices are StablePrice integers — docs: demargined prices. Treat /1000 as decimal odds.
    const decimals = prices.map((p) => (p > 100 ? p / 1000 : p));
    if (isNextGoal || isOverUnder) {
      const fair = impliedFromDecimals(decimals);
      return clamp01(isOverUnder ? fair * 0.35 : fair);
    }
  }

  return null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function intensityP(state: DangerState, nowTs: number): number {
  const window = GAME_CONFIG.INTENSITY_WINDOW_MS;
  state.intensityEvents = state.intensityEvents.filter(
    (e) => nowTs - e.ts <= window
  );
  if (state.intensityEvents.length === 0) return 0.04;
  let score = 0;
  for (const e of state.intensityEvents) {
    const age = (nowTs - e.ts) / window;
    const decay = Math.exp(-3 * age);
    score += e.weight * decay;
  }
  // Map intensity score → pGoalSoon-ish range
  return clamp01(0.03 + Math.min(0.55, score * 0.08));
}

export function applyOddsToDanger(
  state: DangerState,
  odds: OddsSnapshot,
  ts: number
): void {
  const p = clamp01(odds.pGoalSoon);
  if (state.lastOddsP != null && state.lastOddsTs != null) {
    const dtMin = Math.max(1 / 60, (ts - state.lastOddsTs) / 60_000);
    state.drift = (p - state.lastOddsP) / dtMin;
  }
  state.lastOddsP = p;
  state.lastOddsTs = ts;
  state.pGoalSoon = p;
}

export function applyEventToDanger(state: DangerState, event: MatchEvent): void {
  const weights: Partial<Record<MatchEvent["type"], number>> = {
    shot: 1.2,
    corner: 0.9,
    card: 0.4,
    goal: 0,
  };
  const w = weights[event.type];
  if (w != null && w > 0) {
    state.intensityEvents.push({ ts: event.ts, weight: w });
    state.spike = Math.min(
      100,
      state.spike + GAME_CONFIG.EVENT_SPIKE
    );
  }

  if (event.type === "odds" && event.odds) {
    applyOddsToDanger(state, event.odds, event.ts);
  } else if (GAME_CONFIG.USE_INTENSITY_FALLBACK) {
    const intensity = intensityP(state, event.ts);
    // Blend: if we have odds, keep odds as primary; intensity as floor nudge
    if (state.lastOddsP == null) {
      const prev = state.pGoalSoon;
      state.pGoalSoon = intensity;
      state.drift = (intensity - prev) * 6; // rough per-minute-ish
    } else {
      state.pGoalSoon = Math.max(state.pGoalSoon, intensity * 0.85);
    }
  }
}

/** Advance EMA + spike decay by dt seconds of game-time */
export function tickDanger(state: DangerState, dtSeconds: number): void {
  const hl = GAME_CONFIG.DANGER_HALF_LIFE_S;
  const alpha = 1 - Math.pow(0.5, dtSeconds / hl);
  state.smoothed =
    state.smoothed + (state.pGoalSoon - state.smoothed) * alpha;

  if (state.spike > 0) {
    const decayPerS = GAME_CONFIG.EVENT_SPIKE / GAME_CONFIG.SPIKE_DECAY_S;
    state.spike = Math.max(0, state.spike - decayPerS * dtSeconds);
  }
}

/** Display level 0–100 combining smoothed p and event spikes */
export function dangerLevel(state: DangerState): number {
  // Map typical p~0.08 → mid-zone; 0.2 ≈ critical
  const scaled = state.smoothed * 400; // 0.08 → 32, 0.2 → 80
  return Math.max(0, Math.min(100, scaled + state.spike));
}

export function dangerZone(
  level: number
): "CALM" | "BUILDING" | "CRITICAL" {
  if (level < GAME_CONFIG.ZONE_CALM) return "CALM";
  if (level < GAME_CONFIG.ZONE_BUILDING) return "BUILDING";
  return "CRITICAL";
}
