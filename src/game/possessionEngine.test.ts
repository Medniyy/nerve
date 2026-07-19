import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "@/game/config";
import { PossessionEngine } from "@/game/possessionEngine";
import {
  extractPossession,
  normalizeScoresPayload,
  parsePossessionIntensity,
} from "@/streams/normalize";

describe("possession normalize", () => {
  it("parses TxLINE possessionType object keys", () => {
    expect(parsePossessionIntensity({ AttackPossession: {} })).toBe("Attack");
    expect(parsePossessionIntensity({ HighDangerPossession: {} })).toBe(
      "HighDanger"
    );
    expect(parsePossessionIntensity("SafePossession")).toBe("Safe");
  });

  it("extracts possession participant into home/away", () => {
    const r = extractPossession({
      possession: 1,
      possessionType: { DangerPossession: {} },
      participant1IsHome: true,
    });
    expect(r.team).toBe("home");
    expect(r.intensity).toBe("Danger");
  });

  it("normalizes scores payload with possession", () => {
    const ev = normalizeScoresPayload(
      {
        possession: 2,
        possessionType: { SafePossession: {} },
        participant1IsHome: true,
        Ts: 1_700_000_100_000,
        homeTeam: "Brazil",
        awayTeam: "Argentina",
      },
      1000
    );
    expect(ev.possessionTeam).toBe("away");
    expect(ev.possessionIntensity).toBe("Safe");
    expect(ev.type).toBe("possession");
    expect(ev.serverTs).toBe(1_700_000_100_000);
  });
});

describe("PossessionEngine", () => {
  function engineAt(t0: number) {
    let clock = t0;
    const eng = new PossessionEngine({
      sessionDurationId: "5m",
      sessionDurationMs: 5 * 60_000,
      now: () => clock,
      homeTeam: "Brazil",
      awayTeam: "Argentina",
    });
    return {
      eng,
      advance(ms: number) {
        clock += ms;
        eng.__testTick(clock);
      },
      setClock(ms: number) {
        clock = ms;
      },
      now: () => clock,
    };
  }

  it("accumulates Current Hold while pressing and locks on release", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Safe", 0);
    eng.holdStart();
    advance(2000); // 2s * 1 pts/s = 2
    const mid = eng.getSnapshot();
    expect(mid.currentHold).toBeGreaterThanOrEqual(1.9);
    expect(mid.totalScore).toBe(0);
    eng.holdRelease();
    const done = eng.getSnapshot();
    expect(done.totalScore).toBeGreaterThanOrEqual(1);
    expect(done.currentHold).toBe(0);
    expect(done.holdStatus).toBe("LOCKED");
  });

  it("earns faster at HighDanger", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "HighDanger", 0);
    eng.holdStart();
    advance(1000);
    const s = eng.getSnapshot();
    expect(s.pointsPerSecond).toBe(GAME_CONFIG.POINTS_PER_SECOND.HighDanger);
    expect(s.currentHold).toBeGreaterThanOrEqual(7.5);
  });

  it("confirmed turnover loses Current Hold but keeps Total Score", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Attack", 0);
    eng.holdStart();
    advance(3000);
    eng.holdRelease();
    const locked = eng.getSnapshot().totalScore;
    expect(locked).toBeGreaterThan(0);

    eng.holdStart();
    advance(2000);
    const before = eng.getSnapshot().currentHold;
    expect(before).toBeGreaterThan(0);

    // First noisy update — should NOT lose yet
    eng.__testInjectEvent({
      ts: 5000,
      serverTs: 5000,
      type: "possession",
      possessionTeam: "away",
      possessionIntensity: "Safe",
    });
    expect(eng.getSnapshot().holding).toBe(true);
    expect(eng.getSnapshot().currentHold).toBeGreaterThan(0);

    // Second consecutive update confirms turnover
    eng.__testInjectEvent({
      ts: 5100,
      serverTs: 5100,
      type: "possession",
      possessionTeam: "away",
      possessionIntensity: "Safe",
    });
    const after = eng.getSnapshot();
    expect(after.holding).toBe(false);
    expect(after.currentHold).toBe(0);
    expect(after.holdStatus).toBe("LOST");
    expect(after.totalScore).toBe(locked);
  });

  it("confirms turnover after stable window without second update", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Safe", 0);
    eng.holdStart();
    advance(1000);
    eng.__testInjectEvent({
      ts: 1000,
      serverTs: 1000,
      type: "possession",
      possessionTeam: "away",
      possessionIntensity: "Attack",
    });
    expect(eng.getSnapshot().holding).toBe(true);
    advance(GAME_CONFIG.TURNOVER_STABLE_MS + 50);
    const s = eng.getSnapshot();
    expect(s.holding).toBe(false);
    expect(s.holdStatus).toBe("LOST");
    expect(s.possessionTeam).toBe("away");
  });

  it("goal auto-locks Current Hold and does not punish", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Danger", 0);
    eng.holdStart();
    advance(2000);
    const hold = eng.getSnapshot().currentHold;
    expect(hold).toBeGreaterThan(0);
    eng.__testInjectEvent({
      ts: 2000,
      serverTs: 2000,
      type: "goal",
      team: "home",
      homeScore: 1,
      awayScore: 0,
    });
    const s = eng.getSnapshot();
    expect(s.holding).toBe(false);
    expect(s.currentHold).toBe(0);
    expect(s.totalScore).toBeGreaterThanOrEqual(Math.floor(hold));
    expect(s.phase).toBe("goal_pause");
    expect(s.goalFlash?.locked).toBeGreaterThan(0);
  });

  it("ends session and auto-locks remaining hold", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("away", "Safe", 0);
    eng.holdStart();
    advance(5 * 60_000 + 100);
    const s = eng.getSnapshot();
    expect(s.phase).toBe("ended");
    expect(s.holding).toBe(false);
    expect(s.totalScore).toBeGreaterThan(0);
  });

  it("cancelHold clears unbanked points on reconnect", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Attack", 0);
    eng.holdStart();
    advance(1500);
    eng.holdRelease();
    const locked = eng.getSnapshot().totalScore;
    eng.holdStart();
    advance(800);
    eng.cancelHold();
    const s = eng.getSnapshot();
    expect(s.totalScore).toBe(locked);
    expect(s.currentHold).toBe(0);
    expect(s.holding).toBe(false);
  });

  it("pauses scoring while syncing / unknown possession", () => {
    const { eng, advance } = engineAt(0);
    eng.startImmediate();
    eng.__testSetPossession("home", "Safe", 0);
    eng.holdStart();
    advance(1000);
    const before = eng.getSnapshot().currentHold;
    eng.__testSetPossession(null, null, 1000);
    advance(2000);
    const after = eng.getSnapshot();
    expect(after.syncing).toBe(true);
    expect(after.currentHold).toBeCloseTo(before, 0);
    expect(after.holdEnabled).toBe(false);
  });
});
