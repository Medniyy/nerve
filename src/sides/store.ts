import { createHash, randomBytes } from "node:crypto";
import { settleMarketOnChain } from "@/sides/chain-server";
import type { SportsFixture } from "@/sides/fixtures";
import { computeMatching, settle, USDC, type PositionInput, type Side } from "@/sides/math";
import { getTxLineSnapshot } from "@/sides/txline-feed";

/**
 * SIDES practice authority.
 *
 * A market is created only after a connected wallet explicitly starts it.
 * Live markets settle from refreshed real-score snapshots; completed fixtures
 * replay real goal/set outcomes on a short practice clock. The ledger is still
 * a devnet practice ledger until the Anchor escrow program replaces it.
 */

export const FEE_BPS = 100n;
const OPEN_MS = 3 * 60_000;
const FOOTBALL_WINDOW_MS = 5 * 60_000;
const TENNIS_WINDOW_MS = 12 * 60_000;
const REPLAY_WINDOW_MS = 75_000;
const NEXT_ROUND_DELAY_MS = 12_000;

export type RoundPhase = "open" | "window" | "settled" | "void";

export interface SidesPosition {
  playerKey: string;
  side: Side;
  stake: bigint;
  commitHash: string;
  txSignature: string;
  claimSignature?: string;
  matched?: bigint;
  refund?: bigint;
  payout?: bigint;
  /** Early cash-out: value locked in (micro-USDC) when the player exited mid-window. */
  cashedMicro?: bigint;
  cashedAt?: number;
}

export type PriceSource = "txline" | "static";

export interface SidesRound {
  id: string;
  question: string;
  labelGoal: string;
  labelNoGoal: string;
  priceBps: bigint;
  priceSource: PriceSource;
  phase: RoundPhase;
  winner: Side | null;
  opensAt: number;
  commitClosesAt: number;
  windowEndsAt: number;
  sourceWindow: string;
  startingScoreTotal: number;
  targetSetIndex: number;
  replayOutcome: Side | null;
  positions: SidesPosition[];
  fee?: bigint;
  settledAt?: number;
}

interface MarketState {
  fixture: SportsFixture;
  rounds: SidesRound[];
  seq: number;
}

interface SidesState {
  markets: Map<string, MarketState>;
}

const globalState = globalThis as unknown as { __nerveSides_v4?: SidesState };
const S: SidesState =
  globalState.__nerveSides_v4 ??
  (globalState.__nerveSides_v4 = {
    markets: new Map(),
  });

export function commitHashOf(
  roundId: string,
  playerKey: string,
  side: Side,
  stake: bigint,
  salt: string
): string {
  return createHash("sha256")
    .update(`NERVE_SIDES_V1:${roundId}:${playerKey}:${side}:${stake}:${salt}`)
    .digest("hex");
}

function scoreTotal(fixture: SportsFixture): number {
  const a = Number.parseFloat(fixture.scoreA);
  const b = Number.parseFloat(fixture.scoreB);
  return (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
}

function replayFootballWindow(fixture: SportsFixture, seq: number) {
  const goals = fixture.goalMinutes;
  const chooseGoal = goals.length > 0 && seq % 2 === 1;
  if (chooseGoal) {
    const goal = goals[(seq - 1) % goals.length];
    const start = Math.max(0, goal - 2);
    return { label: `${start}'–${start + 5}'`, outcome: "GOAL" as const };
  }

  for (let start = 5 + ((seq * 5) % 25); start <= 80; start += 5) {
    if (!goals.some((goal) => goal >= start && goal < start + 5)) {
      return { label: `${start}'–${start + 5}'`, outcome: "NO_GOAL" as const };
    }
  }
  return { label: "0'–5'", outcome: "NO_GOAL" as const };
}

function replayTennisSet(fixture: SportsFixture, seq: number) {
  const setCount = Math.min(fixture.setsA.length, fixture.setsB.length);
  const index = Math.max(0, Math.min(setCount - 1, seq % Math.max(1, setCount)));
  const a = fixture.setsA[index];
  const b = fixture.setsB[index];
  const outcome: Side = a?.winner || (a && b && a.value > b.value) ? "GOAL" : "NO_GOAL";
  return { index, label: `Set ${index + 1}`, outcome };
}

const REPLAY_GOAL_PRICE_BPS = 3400n;
const MIN_LIVE_PRICE_BPS = 500;
const MAX_LIVE_PRICE_BPS = 8500;

/**
 * Football "goal soon" price: driven by the live TxLINE odds feed
 * (StablePrice-derived pGoalSoon) when this fixture is TxLINE-tracked and the
 * feed is fresh; otherwise falls back to a flat replay price. This is the
 * real-data source for what the round charges to back GOAL — not a guess.
 */
function footballGoalPrice(fixture: SportsFixture): { bps: bigint; source: PriceSource } {
  if (fixture.provider === "TxLINE") {
    const snap = getTxLineSnapshot();
    if (snap.oddsFresh && snap.pGoalSoon != null) {
      const bps = Math.round(snap.pGoalSoon * 10_000);
      return {
        bps: BigInt(Math.min(MAX_LIVE_PRICE_BPS, Math.max(MIN_LIVE_PRICE_BPS, bps))),
        source: "txline",
      };
    }
  }
  return { bps: REPLAY_GOAL_PRICE_BPS, source: "static" };
}

/**
 * The live probability of GOAL *right now* for an in-flight window, used for
 * mark-to-market. Two honest forces move it:
 *  1. live TxLINE odds (when this fixture is TxLINE-tracked and the feed is fresh);
 *  2. time decay — each second the window ticks by goal-free, a goal in the
 *     remaining time gets less likely, so P(goal) bleeds toward zero and the
 *     NO-GOAL holder's position climbs. A real goal (score change) crashes it
 *     via settlement, exactly like a crash-game bust.
 */
function liveGoalProb(fixture: SportsFixture, round: SidesRound, now: number): number {
  let base = Number(round.priceBps) / 10_000;
  if (fixture.provider === "TxLINE") {
    const snap = getTxLineSnapshot();
    if (snap.oddsFresh && snap.pGoalSoon != null) base = snap.pGoalSoon;
  }
  const span = round.windowEndsAt - round.commitClosesAt;
  const elapsed = span > 0 ? Math.min(1, Math.max(0, (now - round.commitClosesAt) / span)) : 0;
  // Goal likelihood in the *remaining* window shrinks as the clock runs down.
  return Math.max(0, Math.min(1, base * (1 - elapsed)));
}

/**
 * Fair current value of a position at the live probability — its expected
 * settlement value if the window resolved on today's odds. Refunded (unmatched)
 * stake is worth face value; matched stake is worth its win payout weighted by
 * the live probability of the player's side.
 */
function markToMarket(
  round: SidesRound,
  position: SidesPosition,
  goalTotal: bigint,
  noTotal: bigint,
  goalProb: number
): { markMicro: number; multiple: number } {
  const { matchedGoal, matchedNo, pot } = computeMatching(goalTotal, noTotal, round.priceBps);
  const sideTotal = position.side === "GOAL" ? goalTotal : noTotal;
  const sideMatched = position.side === "GOAL" ? matchedGoal : matchedNo;
  const myMatched = sideTotal > 0n ? (position.stake * sideMatched) / sideTotal : 0n;
  const myRefund = position.stake - myMatched;
  const fee = (pot * FEE_BPS) / 10_000n;
  const distributable = pot - fee;
  const winnerMatched = position.side === "GOAL" ? matchedGoal : matchedNo;
  const myPayoutIfWin =
    winnerMatched > 0n ? Number((distributable * myMatched) / winnerMatched) : 0;
  const myProb = position.side === "GOAL" ? goalProb : 1 - goalProb;
  const markMicro = Number(myRefund) + myPayoutIfWin * myProb;
  const multiple = position.stake > 0n ? markMicro / Number(position.stake) : 0;
  return { markMicro, multiple };
}

function createRound(market: MarketState, now = Date.now()): SidesRound {
  market.seq += 1;
  const fixture = market.fixture;
  const completed = fixture.state === "complete";
  const isFootball = fixture.sport === "football";
  const { bps: priceBps, source: priceSource } = isFootball
    ? footballGoalPrice(fixture)
    : { bps: 5000n, source: "static" as const };
  let question = "";
  let labelGoal = "";
  let labelNoGoal = "";
  let sourceWindow = "";
  let replayOutcome: Side | null = null;
  let targetSetIndex = -1;

  if (isFootball) {
    labelGoal = "Goal";
    labelNoGoal = "No goal";
    if (completed) {
      const replay = replayFootballWindow(fixture, market.seq);
      sourceWindow = replay.label;
      replayOutcome = replay.outcome;
      question = `Was there a goal from ${replay.label}?`;
    } else {
      sourceWindow = "Next 5 minutes";
      question = "Will there be a goal in the next 5 minutes?";
    }
  } else {
    labelGoal = fixture.participantA;
    labelNoGoal = fixture.participantB;
    if (completed) {
      const replay = replayTennisSet(fixture, market.seq);
      targetSetIndex = replay.index;
      sourceWindow = replay.label;
      replayOutcome = replay.outcome;
      question = `Who takes ${replay.label}?`;
    } else {
      targetSetIndex = Math.max(0, fixture.setsA.length - 1, fixture.setsB.length - 1);
      sourceWindow = `Set ${targetSetIndex + 1}`;
      question = "Who takes the current set?";
    }
  }

  const round: SidesRound = {
    id: `${fixture.id}:r${market.seq}`,
    question,
    labelGoal,
    labelNoGoal,
    priceBps,
    priceSource,
    phase: "open",
    winner: null,
    opensAt: now,
    commitClosesAt: now + OPEN_MS,
    windowEndsAt:
      now +
      OPEN_MS +
      (completed ? REPLAY_WINDOW_MS : isFootball ? FOOTBALL_WINDOW_MS : TENNIS_WINDOW_MS),
    sourceWindow,
    startingScoreTotal: scoreTotal(fixture),
    targetSetIndex,
    replayOutcome,
    positions: [],
  };
  market.rounds.unshift(round);
  market.rounds = market.rounds.slice(0, 20);
  return round;
}

function settleRound(
  fixtureId: string,
  round: SidesRound,
  winner: Side | null,
  now = Date.now()
) {
  // Cashed-out positions already settled at their mark; they leave the pool.
  const inputs: PositionInput[] = round.positions
    .filter((position) => position.cashedMicro == null)
    .map((position, index) => ({
      id: String(index),
      side: position.side,
      stake: position.stake,
    }));
  const result = settle(inputs, round.priceBps, FEE_BPS, winner);
  let liveIndex = 0;
  round.positions.forEach((position) => {
    if (position.cashedMicro != null) return;
    const resolved = result.positions.find((item) => item.id === String(liveIndex));
    liveIndex += 1;
    if (!resolved) return;
    position.matched = resolved.matched;
    position.refund = resolved.refund;
    position.payout = resolved.payout;
  });
  round.fee = result.fee;
  round.winner = winner;
  round.phase = winner === null || result.pot === 0n ? "void" : "settled";
  round.settledAt = now;
  void settleMarketOnChain(fixtureId, round.id, round.winner).catch((error) => {
    console.error("SIDES devnet settlement failed", error);
  });
}

function tennisWinner(fixture: SportsFixture, index: number): Side | null {
  const a = fixture.setsA[index];
  const b = fixture.setsB[index];
  if (!a || !b) return null;
  if (a.winner) return "GOAL";
  if (b.winner) return "NO_GOAL";
  const laterSetExists = fixture.setsA.length > index + 1 || fixture.setsB.length > index + 1;
  if (laterSetExists || fixture.state === "complete") {
    if (a.value > b.value) return "GOAL";
    if (b.value > a.value) return "NO_GOAL";
  }
  return null;
}

function syncMarket(market: MarketState, latest: SportsFixture, now = Date.now()) {
  market.fixture = latest;
  const active = market.rounds.find(
    (round) => round.phase === "open" || round.phase === "window"
  );

  if (active?.phase === "open" && now >= active.commitClosesAt) {
    active.phase = "window";
  }
  if (active?.phase === "window") {
    if (active.replayOutcome) {
      if (now >= active.windowEndsAt) settleRound(latest.id, active, active.replayOutcome, now);
    } else if (latest.sport === "football") {
      if (scoreTotal(latest) > active.startingScoreTotal) settleRound(latest.id, active, "GOAL", now);
      else if (now >= active.windowEndsAt || latest.state === "complete") {
        settleRound(latest.id, active, "NO_GOAL", now);
      }
    } else {
      const winner = tennisWinner(latest, active.targetSetIndex);
      if (winner) settleRound(latest.id, active, winner, now);
      else if (now >= active.windowEndsAt || latest.state === "complete") {
        settleRound(latest.id, active, null, now);
      }
    }
  }

  const stillActive = market.rounds.some(
    (round) => round.phase === "open" || round.phase === "window"
  );
  const last = market.rounds[0];
  if (
    !stillActive &&
    latest.state !== "upcoming" &&
    (!last?.settledAt || now - last.settledAt >= NEXT_ROUND_DELAY_MS)
  ) {
    createRound(market, now);
  }
}

export function startMarket(playerKey: string, fixture: SportsFixture) {
  if (fixture.state === "upcoming") {
    return { ok: false as const, error: "This fixture has not started yet" };
  }
  let market = S.markets.get(fixture.id);
  if (!market) {
    market = { fixture, rounds: [], seq: 0 };
    S.markets.set(fixture.id, market);
    createRound(market);
  } else {
    syncMarket(market, fixture);
  }
  return { ok: true as const };
}

export function enter(
  playerKey: string,
  fixtureId: string,
  roundId: string,
  side: Side,
  stake: bigint,
  txSignature: string
): { ok: true; commitHash: string } | { ok: false; error: string } {
  const market = S.markets.get(fixtureId);
  if (!market) return { ok: false, error: "Start this fixture first" };
  const round = market.rounds.find((item) => item.id === roundId);
  if (!round) return { ok: false, error: "Round not found" };
  if (round.phase !== "open" || Date.now() >= round.commitClosesAt) {
    return { ok: false, error: "This round is already locked" };
  }
  if (stake <= 0n || stake > 25n * USDC) {
    return { ok: false, error: "Choose a stake between 1 and 25" };
  }
  if (round.positions.some((position) => position.playerKey === playerKey)) {
    return { ok: false, error: "You already picked a side this round" };
  }
  const salt = randomBytes(16).toString("hex");
  const commitHash = commitHashOf(round.id, playerKey, side, stake, salt);
  round.positions.push({ playerKey, side, stake, commitHash, txSignature });
  return { ok: true, commitHash };
}

/**
 * Early cash-out. Locks the player's current mark-to-market value and removes
 * them from the live pool. Server-authority (practice) settlement — the fully
 * trustless on-chain unwind is a documented next step; on-chain real-USDC
 * rounds otherwise settle at the final whistle.
 */
export function cashOut(
  playerKey: string,
  fixtureId: string,
  roundId: string,
  now = Date.now()
): { ok: true; cashedMicro: string; multiple: number } | { ok: false; error: string } {
  const market = S.markets.get(fixtureId);
  if (!market) return { ok: false, error: "Room not found" };
  syncMarket(market, market.fixture, now);
  const round = market.rounds.find((item) => item.id === roundId);
  if (!round) return { ok: false, error: "Round not found" };
  if (round.phase !== "window") {
    return { ok: false, error: "You can only cash out while the round is live" };
  }
  const position = round.positions.find((item) => item.playerKey === playerKey);
  if (!position) return { ok: false, error: "You have no position in this round" };
  if (position.cashedMicro != null) return { ok: false, error: "Already cashed out" };

  const goalTotal = round.positions
    .filter((item) => item.side === "GOAL")
    .reduce((total, item) => total + item.stake, 0n);
  const noTotal = round.positions
    .filter((item) => item.side === "NO_GOAL")
    .reduce((total, item) => total + item.stake, 0n);
  const prob = liveGoalProb(market.fixture, round, now);
  const { markMicro, multiple } = markToMarket(round, position, goalTotal, noTotal, prob);
  const cashed = BigInt(Math.max(0, Math.round(markMicro)));
  position.cashedMicro = cashed;
  position.cashedAt = now;
  return { ok: true, cashedMicro: cashed.toString(), multiple };
}

export function stateFor(playerKey: string, fixture: SportsFixture, now = Date.now()) {
  const market = S.markets.get(fixture.id);
  if (!market) return null;
  syncMarket(market, fixture, now);

  const fmt = (value: bigint) => value.toString();
  return {
    fixture: market.fixture,
    feeBps: Number(FEE_BPS),
    roomCode: createHash("sha256").update(fixture.id).digest("hex").slice(0, 6).toUpperCase(),
    rounds: market.rounds.slice(0, 10).map((round) => {
      const mine = round.positions.find((position) => position.playerKey === playerKey);
      const publicPositions = round.positions;
      const goal = round.positions
        .filter((position) => position.side === "GOAL")
        .reduce((total, position) => total + position.stake, 0n);
      const noGoal = round.positions
        .filter((position) => position.side === "NO_GOAL")
        .reduce((total, position) => total + position.stake, 0n);
      const goalProb = liveGoalProb(market.fixture, round, now);
      // Live mark for the player's own position while the window is in flight.
      let mark: { markMicro: number; multiple: number } | null = null;
      if (mine && mine.cashedMicro == null && round.phase === "window") {
        mark = markToMarket(round, mine, goal, noGoal, goalProb);
      }
      return {
        id: round.id,
        question: round.question,
        labelGoal: round.labelGoal,
        labelNoGoal: round.labelNoGoal,
        priceBps: Number(round.priceBps),
        priceSource: round.priceSource,
        livePriceBps: Math.round(goalProb * 10_000),
        phase: round.phase,
        winner: round.winner,
        opensAt: round.opensAt,
        commitClosesAt: round.commitClosesAt,
        windowEndsAt: round.windowEndsAt,
        sourceWindow: round.sourceWindow,
        players: publicPositions.length,
        pot: fmt(goal + noGoal),
        split:
          round.phase === "open" ? null : { goal: fmt(goal), noGoal: fmt(noGoal) },
        fee: round.fee != null ? fmt(round.fee) : null,
        mine: mine
          ? {
              side: mine.side,
              stake: fmt(mine.stake),
              commitHash: mine.commitHash,
              txSignature: mine.txSignature,
              claimSignature: mine.claimSignature ?? null,
              matched: mine.matched != null ? fmt(mine.matched) : null,
              refund: mine.refund != null ? fmt(mine.refund) : null,
              payout: mine.payout != null ? fmt(mine.payout) : null,
              cashedMicro: mine.cashedMicro != null ? fmt(mine.cashedMicro) : null,
              markMicro: mark ? Math.round(mark.markMicro) : null,
              markMultiple: mark ? mark.multiple : null,
            }
          : null,
      };
    }),
  };
}

export function roundFor(fixtureId: string, roundId: string): SidesRound | null {
  return S.markets.get(fixtureId)?.rounds.find((round) => round.id === roundId) ?? null;
}

export function historyFor(playerKey: string) {
  const rows = Array.from(S.markets.values()).flatMap((market) =>
    market.rounds.flatMap((round) => {
      const mine = round.positions.find((position) => position.playerKey === playerKey);
      if (!mine) return [];
      const cashed = mine.cashedMicro != null;
      const returned = cashed
        ? (mine.cashedMicro ?? 0n)
        : (mine.refund ?? 0n) + (mine.payout ?? 0n);
      return [{
        id: round.id,
        fixtureId: market.fixture.id,
        fixture: `${market.fixture.participantA} · ${market.fixture.participantB}`,
        sport: market.fixture.sport,
        question: round.question,
        side: mine.side,
        sideLabel: mine.side === "GOAL" ? round.labelGoal : round.labelNoGoal,
        stake: mine.stake.toString(),
        returned: returned.toString(),
        phase: cashed ? "cashed" : round.phase,
        winner: round.winner,
        txSignature: mine.txSignature,
        claimSignature: mine.claimSignature ?? null,
        enteredAt: round.opensAt,
        settledAt: mine.cashedAt ?? round.settledAt ?? null,
      }];
    })
  );
  return rows.sort((a, b) => (b.settledAt ?? b.enteredAt) - (a.settledAt ?? a.enteredAt));
}

export function markClaimed(
  playerKey: string,
  fixtureId: string,
  roundId: string,
  claimSignature: string
): boolean {
  const position = S.markets
    .get(fixtureId)
    ?.rounds.find((round) => round.id === roundId)
    ?.positions.find((item) => item.playerKey === playerKey);
  if (!position) return false;
  position.claimSignature = claimSignature;
  return true;
}
