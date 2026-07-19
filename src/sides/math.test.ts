import { describe, expect, it } from "vitest";
import {
  computeMatching,
  payoutMultipleHundredths,
  settle,
  USDC,
  type PositionInput,
} from "./math";

const usdc = (n: number) => BigInt(Math.round(n * 1e6));

function conservation(
  positions: PositionInput[],
  priceBps: bigint,
  feeBps: bigint,
  winner: "GOAL" | "NO_GOAL" | null
) {
  const r = settle(positions, priceBps, feeBps, winner);
  const deposits = positions.reduce((a, p) => a + p.stake, 0n);
  const paid = r.positions.reduce((a, p) => a + p.payout + p.refund, 0n);
  expect(paid + r.fee + r.dust).toBe(deposits);
  expect(r.dust >= 0n).toBe(true);
  // dust stays tiny: bounded by number of positions (floor losses)
  expect(r.dust <= BigInt(positions.length + 2)).toBe(true);
  return r;
}

describe("computeMatching — spec example", () => {
  it("30 GOAL vs 35 NO at 30% → 15/35 matched, pot 50", () => {
    const m = computeMatching(usdc(30), usdc(35), 3000n);
    expect(m.matchedGoal).toBe(usdc(15));
    expect(m.matchedNo).toBe(usdc(35));
    expect(m.pot).toBe(usdc(50));
  });

  it("one-sided market matches nothing", () => {
    expect(computeMatching(usdc(10), 0n, 3000n).pot).toBe(0n);
    expect(computeMatching(0n, usdc(10), 3000n).pot).toBe(0n);
  });
});

describe("settle", () => {
  const priceBps = 3000n;
  const feeBps = 200n;

  it("GOAL wins: winner earns 1/price on matched stake minus fee; overcrowded side refunded pro-rata", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: usdc(30) },
      { id: "b", side: "NO_GOAL", stake: usdc(35) },
    ];
    const r = conservation(positions, priceBps, feeBps, "GOAL");
    const a = r.positions.find((p) => p.id === "a")!;
    const b = r.positions.find((p) => p.id === "b")!;
    expect(a.matched).toBe(usdc(15));
    expect(a.refund).toBe(usdc(15));
    expect(r.fee).toBe(usdc(1)); // 2% of 50
    expect(a.payout).toBe(usdc(49)); // whole distributable pot
    expect(b.payout).toBe(0n);
    expect(b.refund).toBe(0n); // fully matched, lost
  });

  it("NO_GOAL wins: 35 staked returns 49 (1.4x on pot share)", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: usdc(30) },
      { id: "b", side: "NO_GOAL", stake: usdc(35) },
    ];
    const r = conservation(positions, priceBps, feeBps, "NO_GOAL");
    const b = r.positions.find((p) => p.id === "b")!;
    expect(b.payout).toBe(usdc(49));
  });

  it("pro-rata fill within the overcrowded side", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: usdc(20) },
      { id: "b", side: "GOAL", stake: usdc(10) },
      { id: "c", side: "NO_GOAL", stake: usdc(35) },
    ];
    const r = conservation(positions, priceBps, feeBps, "GOAL");
    const a = r.positions.find((p) => p.id === "a")!;
    const b = r.positions.find((p) => p.id === "b")!;
    // 15 matched across 30 deposited → 50% fill each
    expect(a.matched).toBe(usdc(10));
    expect(b.matched).toBe(usdc(5));
    // winnings pro-rata by matched stake: a gets 2/3 of 49
    expect(a.payout > b.payout).toBe(true);
  });

  it("void refunds everyone in full with zero fee", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: usdc(12) },
      { id: "b", side: "NO_GOAL", stake: usdc(7) },
    ];
    const r = conservation(positions, priceBps, feeBps, null);
    expect(r.fee).toBe(0n);
    for (const p of r.positions) expect(p.refund).toBe(p.stake);
  });

  it("one-sided settled round degrades to void", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: usdc(10) },
    ];
    const r = conservation(positions, priceBps, feeBps, "GOAL");
    expect(r.fee).toBe(0n);
    expect(r.positions[0].refund).toBe(usdc(10));
  });

  it("conservation holds under ragged amounts", () => {
    const positions: PositionInput[] = [
      { id: "a", side: "GOAL", stake: 3_333_333n },
      { id: "b", side: "GOAL", stake: 777_777n },
      { id: "c", side: "NO_GOAL", stake: 9_999_999n },
      { id: "d", side: "NO_GOAL", stake: 1n },
    ];
    conservation(positions, 2750n, 200n, "GOAL");
    conservation(positions, 2750n, 200n, "NO_GOAL");
    conservation(positions, 2750n, 200n, null);
  });
});

describe("display multiple", () => {
  it("30% GOAL pays 3.33x, NO pays 1.42x", () => {
    expect(payoutMultipleHundredths(3000n, "GOAL")).toBe(333n);
    expect(payoutMultipleHundredths(3000n, "NO_GOAL")).toBe(142n);
  });
});

// Re-export guard so USDC stays fixed at six decimal places.
it("USDC micro constant", () => expect(USDC).toBe(1_000_000n));
