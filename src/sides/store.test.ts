import { describe, expect, it } from "vitest";
import type { SportsFixture } from "@/sides/fixtures";
import { USDC } from "@/sides/math";
import { cashOut, enter, startMarket, stateFor } from "@/sides/store";

function liveFootballFixture(id: string): SportsFixture {
  return {
    id,
    sport: "football",
    competition: "Test League",
    participantA: "Home",
    participantB: "Away",
    startsAt: Date.now() - 60_000,
    state: "live",
    status: "45'",
    scoreA: "0",
    scoreB: "0",
    clock: "45'",
    provider: "ESPN", // static price → deterministic, no live feed needed
    goalMinutes: [],
    setsA: [],
    setsB: [],
  };
}

describe("NERVE hold-window mark-to-market + cash-out", () => {
  it("prices a live position and lets the player cash out before the whistle", () => {
    const fixture = liveFootballFixture(`test:${Date.now()}`);
    const roundId = `${fixture.id}:r1`;

    expect(startMarket("p1", fixture).ok).toBe(true);
    expect(enter("p1", fixture.id, roundId, "NO_GOAL", 5n * USDC, "sig1").ok).toBe(true);
    expect(enter("p2", fixture.id, roundId, "GOAL", 5n * USDC, "sig2").ok).toBe(true);

    // Read the round to find when the entry window closes.
    const openState = stateFor("p1", fixture)!;
    const round = openState.rounds[0];
    expect(round.phase).toBe("open");
    const windowNow = round.commitClosesAt + 1_000; // 1s into the live window

    // In the live window, the NO_GOAL holder now has a moving mark-to-market value.
    const liveState = stateFor("p1", fixture, windowNow)!;
    const liveRound = liveState.rounds[0];
    expect(liveRound.phase).toBe("window");
    expect(liveRound.mine).not.toBeNull();
    expect(typeof liveRound.mine!.markMicro).toBe("number");
    expect(liveRound.mine!.markMicro!).toBeGreaterThan(0);
    expect(liveRound.mine!.markMultiple!).toBeGreaterThan(0);
    // NO_GOAL survives as the clock ticks: its live win-prob should exceed the raw 34% goal price.
    expect(liveRound.livePriceBps).toBeLessThan(3400);

    // Cash out mid-window.
    const result = cashOut("p1", fixture.id, roundId, windowNow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(BigInt(result.cashedMicro)).toBeGreaterThan(0n);
    }

    // Position is now settled at its cash value; a second cash-out is rejected.
    const after = stateFor("p1", fixture, windowNow + 500)!;
    expect(after.rounds[0].mine!.cashedMicro).not.toBeNull();
    expect(cashOut("p1", fixture.id, roundId, windowNow + 500).ok).toBe(false);
  });

  it("value climbs as the goal-free window elapses", () => {
    const fixture = liveFootballFixture(`test-climb:${Date.now()}`);
    const roundId = `${fixture.id}:r1`;
    startMarket("c1", fixture);
    enter("c1", fixture.id, roundId, "NO_GOAL", 5n * USDC, "sigA");
    enter("c2", fixture.id, roundId, "GOAL", 5n * USDC, "sigB");

    const round = stateFor("c1", fixture)!.rounds[0];
    const early = stateFor("c1", fixture, round.commitClosesAt + 1_000)!.rounds[0].mine!.markMicro!;
    const late = stateFor("c1", fixture, round.windowEndsAt - 1_000)!.rounds[0].mine!.markMicro!;
    // Later in a goal-free window, the NO_GOAL position is worth more.
    expect(late).toBeGreaterThan(early);
  });
});
