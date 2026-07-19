/**
 * Unit tests for the pure game engine (no React).
 */
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "./config";
import {
  applyEventToDanger,
  createDangerState,
  dangerLevel,
  dangerZone,
  impliedFromDecimals,
  pFromOddsPayload,
  tickDanger,
} from "./danger";
import { GameEngine } from "./engine";

describe("danger", () => {
  it("impliedFromDecimals normalizes overround", () => {
    const p = impliedFromDecimals([2.0, 2.0]);
    expect(p).toBeCloseTo(0.5, 5);
  });

  it("reads Pct from NextGoal-shaped odds", () => {
    const p = pFromOddsPayload({
      SuperOddsType: "NextGoal",
      PriceNames: ["Yes", "No"],
      Pct: ["18.500", "81.500"],
      Prices: [5400, 1200],
    });
    expect(p).toBeCloseTo(0.185, 3);
  });

  it("EMA smooths and spikes on shots", () => {
    const s = createDangerState();
    s.pGoalSoon = 0.2;
    for (let i = 0; i < 20; i++) tickDanger(s, 0.5);
    expect(s.smoothed).toBeGreaterThan(0.05);
    applyEventToDanger(s, { ts: 1000, type: "shot", team: "home" });
    expect(s.spike).toBeGreaterThanOrEqual(GAME_CONFIG.EVENT_SPIKE);
    const level = dangerLevel(s);
    expect(dangerZone(level)).toBeTruthy();
  });
});

describe("GameEngine", () => {
  it("grows multiplier under fixed danger", () => {
    const eng = new GameEngine({ balance: 1000 });
    eng.__testStartRound();
    const before = eng.getSnapshot().multiplier;
    // 10 seconds at p=P_REF → danger=1 → growth BASE_GROWTH/s
    for (let i = 0; i < 40; i++) {
      eng.__testTick(0.25, GAME_CONFIG.P_REF);
    }
    const after = eng.getSnapshot().multiplier;
    expect(after).toBeGreaterThan(before);
    // ≈ 1.01^10 ≈ 1.104
    expect(after).toBeGreaterThan(1.08);
    expect(after).toBeLessThan(1.2);
  });

  it("hold and cash out banks stake × multiplier", () => {
    const eng = new GameEngine({ balance: 1000 });
    eng.__testStartRound();
    expect(eng.hold()).toBe(true);
    eng.__testTick(5, GAME_CONFIG.P_REF);
    const mult = eng.getSnapshot().multiplier;
    expect(eng.cashOut()).toBe(true);
    const bal = eng.getBalance();
    expect(bal).toBe(1000 - 100 + Math.floor(100 * mult));
  });

  it("crash catches holders and starts intermission", () => {
    const eng = new GameEngine({ balance: 1000 });
    eng.__testStartRound();
    eng.hold();
    eng.__testCrash("home", 67);
    const snap = eng.getSnapshot();
    expect(snap.phase).toBe("crashed");
    expect(snap.lastResult?.playerCaught).toBe(true);
    expect(snap.lastResult?.reason).toBe("goal");
    expect(snap.balance).toBe(900); // lost stake; above floor
  });

  it("ghosts spawn with personality thresholds", () => {
    const eng = new GameEngine();
    eng.__testStartRound();
    const ghosts = eng.getSnapshot().ghosts;
    expect(ghosts).toHaveLength(4);
    expect(ghosts.map((g) => g.name)).toContain("Ghost_Paperhands");
    for (const g of ghosts) {
      expect(g.threshold).toBeGreaterThan(1);
    }
  });

  it("explains the latest danger movement in football language", () => {
    const eng = new GameEngine();
    eng.__testStartRound();
    eng.__testInjectEvent({
      ts: 2_000,
      type: "corner",
      team: "away",
      awayTeam: "Argentina",
      matchMinute: 18,
    });
    const cause = eng.getSnapshot().dangerCause;
    expect(cause.kind).toBe("corner");
    expect(cause.label).toContain("Argentina");
    expect(cause.label).toContain("pressure building");
  });

  it("balance floors at BALANCE_FLOOR", () => {
    const eng = new GameEngine({ balance: 150 });
    eng.__testStartRound();
    eng.hold(); // 50 left
    eng.__testCrash("away", 10);
    expect(eng.getBalance()).toBe(GAME_CONFIG.BALANCE_FLOOR);
  });

  it("whistle auto-cashes holders", () => {
    const eng = new GameEngine({ balance: 1000 });
    eng.__testStartRound();
    eng.hold();
    eng.__testTick(3, GAME_CONFIG.P_REF);
    const mult = eng.getSnapshot().multiplier;
    eng.__testInjectEvent({ ts: 10_000, type: "halftime", matchMinute: 45 });
    const snap = eng.getSnapshot();
    expect(snap.holding).toBe(false);
    expect(snap.lastResult?.reason).toBe("halftime");
    expect(snap.balance).toBe(1000 - 100 + Math.floor(100 * mult));
  });
});
