/**
 * SIDES — integer settlement math (micro-USDC, bigint).
 * Pure functions; identical logic is destined for the Phase B Anchor program,
 * so everything is floor-division integer arithmetic with an explicit dust policy:
 * dust from floors accrues to the fee pool. Invariant (tested):
 *   payouts + refunds + fee + dust == deposits.
 */

export type Side = "GOAL" | "NO_GOAL";

export const BPS = 10_000n;
export const USDC = 1_000_000n; // 6 decimals

export interface PositionInput {
  id: string;
  side: Side;
  stake: bigint; // micro-USDC deposited
}

export interface PositionResult {
  id: string;
  side: Side;
  stake: bigint;
  matched: bigint;
  refund: bigint;
  payout: bigint; // total returned at settlement, excluding refund
}

export interface SettlementResult {
  matchedGoal: bigint;
  matchedNo: bigint;
  pot: bigint;
  fee: bigint;
  dust: bigint;
  positions: PositionResult[];
}

export function computeMatching(
  goalDeposits: bigint,
  noDeposits: bigint,
  priceBps: bigint
): { matchedGoal: bigint; matchedNo: bigint; pot: bigint } {
  if (goalDeposits <= 0n || noDeposits <= 0n || priceBps <= 0n || priceBps >= BPS) {
    return { matchedGoal: 0n, matchedNo: 0n, pot: 0n };
  }
  const capGoal = (goalDeposits * BPS) / priceBps; // contracts the GOAL side can fund
  const capNo = (noDeposits * BPS) / (BPS - priceBps);
  const contracts = capGoal < capNo ? capGoal : capNo;
  const matchedGoal = (contracts * priceBps) / BPS;
  const matchedNo = (contracts * (BPS - priceBps)) / BPS;
  return { matchedGoal, matchedNo, pot: matchedGoal + matchedNo };
}

/**
 * Settle a round.
 * winner === null → void: full refunds, zero fee.
 * Fee = feeBps of the matched pot, only when settled.
 * Per-position matching is pro-rata with floor division; winners split
 * (pot - fee) pro-rata by matched stake.
 */
export function settle(
  positions: PositionInput[],
  priceBps: bigint,
  feeBps: bigint,
  winner: Side | null
): SettlementResult {
  const goalDeposits = sum(positions, "GOAL");
  const noDeposits = sum(positions, "NO_GOAL");

  if (winner === null) {
    return {
      matchedGoal: 0n,
      matchedNo: 0n,
      pot: 0n,
      fee: 0n,
      dust: 0n,
      positions: positions.map((p) => ({
        ...p,
        matched: 0n,
        refund: p.stake,
        payout: 0n,
      })),
    };
  }

  const { matchedGoal, matchedNo, pot } = computeMatching(
    goalDeposits,
    noDeposits,
    priceBps
  );

  if (pot === 0n) {
    // one-sided round — treat as void
    return settle(positions, priceBps, feeBps, null);
  }

  const fee = (pot * feeBps) / BPS;
  const distributable = pot - fee;
  const winnerMatchedTotal = winner === "GOAL" ? matchedGoal : matchedNo;

  const results: PositionResult[] = positions.map((p) => {
    const sideDeposits = p.side === "GOAL" ? goalDeposits : noDeposits;
    const sideMatched = p.side === "GOAL" ? matchedGoal : matchedNo;
    const matched =
      sideDeposits === 0n ? 0n : (p.stake * sideMatched) / sideDeposits;
    const refund = p.stake - matched;
    const payout =
      p.side === winner && winnerMatchedTotal > 0n
        ? (distributable * matched) / winnerMatchedTotal
        : 0n;
    return { ...p, matched, refund, payout };
  });

  const paid = results.reduce((a, r) => a + r.payout + r.refund, 0n);
  const deposits = goalDeposits + noDeposits;
  const dust = deposits - paid - fee;

  return { matchedGoal, matchedNo, pot, fee, dust, positions: results };
}

function sum(positions: PositionInput[], side: Side): bigint {
  return positions
    .filter((p) => p.side === side)
    .reduce((a, p) => a + p.stake, 0n);
}

/** Fixed-price payout multiple for display: 1/price, in hundredths (e.g. 333 = 3.33x). */
export function payoutMultipleHundredths(priceBps: bigint, side: Side): bigint {
  const p = side === "GOAL" ? priceBps : BPS - priceBps;
  if (p === 0n) return 0n;
  return (100n * BPS) / p;
}
