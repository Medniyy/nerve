/**
 * Unit tests for odds/danger helpers (legacy signal) + re-exported for vitest discovery.
 * Primary scoring coverage lives in possessionEngine.test.ts.
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
