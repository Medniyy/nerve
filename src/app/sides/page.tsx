"use client";

import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  claimUsdcPosition,
  lockUsdcPosition,
  usdcBalance,
} from "@/sides/chain-client";
import { practiceIntentMessage, type PracticeIntent } from "@/sides/auth-message";
import type { FixtureSport, SportsFixture } from "@/sides/fixtures";
import type { Side } from "@/sides/math";
import styles from "./sides.module.css";

const SolanaProviders = dynamic(
  () => import("@/ui/SolanaProviders").then((module) => module.SolanaProviders),
  { ssr: false }
);

interface MineView {
  side: Side;
  stake: string;
  commitHash: string;
  txSignature: string;
  claimSignature: string | null;
  matched: string | null;
  refund: string | null;
  payout: string | null;
  cashedMicro: string | null;
  markMicro: number | null;
  markMultiple: number | null;
}

interface RoundView {
  id: string;
  question: string;
  labelGoal: string;
  labelNoGoal: string;
  priceBps: number;
  priceSource: "txline" | "static";
  livePriceBps: number;
  phase: "open" | "window" | "settled" | "void";
  winner: Side | null;
  opensAt: number;
  commitClosesAt: number;
  windowEndsAt: number;
  sourceWindow: string;
  players: number;
  pot: string;
  split: { goal: string; noGoal: string } | null;
  mine: MineView | null;
}

interface SidesState {
  fixture: SportsFixture;
  feeBps: number;
  roomCode: string;
  rounds: RoundView[];
}

interface HistoryPosition {
  id: string;
  fixtureId: string;
  fixture: string;
  sport: FixtureSport;
  question: string;
  side: Side;
  sideLabel: string;
  stake: string;
  returned: string;
  phase: RoundView["phase"] | "cashed";
  winner: Side | null;
  txSignature: string;
  claimSignature: string | null;
  enteredAt: number;
  settledAt: number | null;
}

type Pending = "start" | "prepare" | "wallet" | "confirm" | "record" | null;
const STAKES = [1, 5, 10];
const EXPLORER = "https://explorer.solana.com/tx";
const ESCROW_READY = process.env.NEXT_PUBLIC_SIDES_ESCROW_ENABLED === "true";

function micro(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value) / 1_000_000;
}

function money(value: string | number | null | undefined): string {
  return micro(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactName(name: string): string {
  return name.length > 20 ? `${name.slice(0, 19)}...` : name;
}

function timeUntil(timestamp: number, now: number): number {
  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function payout(stake: number, priceBps: number, side: Side, feeBps: number) {
  const sideBps = side === "GOAL" ? priceBps : 10_000 - priceBps;
  const price = sideBps / 10_000;
  const gross = price > 0 ? stake / price : 0;
  const fee = gross * (feeBps / 10_000);
  return { price, gross, fee, net: gross - fee };
}

function fixtureTime(fixture: SportsFixture): string {
  if (fixture.state === "live") return fixture.clock || "Live now";
  if (fixture.state === "complete") return "Real replay";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(fixture.startsAt);
}

function randomNonce(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function signatureBase64(signature: Uint8Array): string {
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Connection timed out. Please retry.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function pendingCopy(pending: Pending): string {
  if (pending === "prepare") return "Opening shared vault...";
  if (pending === "wallet") return "Approve in your wallet";
  if (pending === "confirm") return "Confirming on devnet...";
  if (pending === "record") return "Adding you to the room...";
  return "";
}

function SidesExperience() {
  const { connection } = useConnection();
  const { connected, publicKey, signMessage, sendTransaction } = useWallet();
  const [fixtures, setFixtures] = useState<SportsFixture[]>([]);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [sport, setSport] = useState<FixtureSport>("football");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionFixtureId, setSessionFixtureId] = useState<string | null>(null);
  const [state, setState] = useState<SidesState | null>(null);
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [stake, setStake] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<Pending>(null);
  const [confirmSide, setConfirmSide] = useState<Side | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [cashing, setCashing] = useState(false);
  const [networkIssue, setNetworkIssue] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = publicKey?.toBase58() ?? "";
  const selected = fixtures.find((fixture) => fixture.id === selectedId) ?? null;
  const sessionFixture =
    state?.fixture ?? fixtures.find((fixture) => fixture.id === sessionFixtureId) ?? null;
  const activeRound =
    state?.rounds.find((round) => round.phase === "open" || round.phase === "window") ?? null;
  const latestResult = state?.rounds.find(
    (round) => round.phase === "settled" || round.phase === "void"
  );

  const say = useCallback((text: string, tone: "info" | "error" = "info") => {
    setNotice({ tone, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5200);
  }, []);

  const loadFixtures = useCallback(async () => {
    try {
      setFixtureError(null);
      const response = await fetchWithTimeout("/api/sides/fixtures", { cache: "no-store" });
      const body = (await response.json()) as { fixtures?: SportsFixture[]; error?: string };
      if (!response.ok || !body.fixtures?.length) throw new Error(body.error ?? "No games available");
      setFixtures(body.fixtures);
      setSelectedId((current) => {
        if (current && body.fixtures?.some((fixture) => fixture.id === current)) return current;
        const sharedRoom = new URLSearchParams(window.location.search).get("room");
        if (sharedRoom && body.fixtures?.some((fixture) => fixture.id === sharedRoom)) return sharedRoom;
        return (
          body.fixtures?.find((fixture) => fixture.sport === sport && fixture.state === "live")?.id ??
          body.fixtures?.find((fixture) => fixture.sport === sport)?.id ??
          null
        );
      });
    } catch (error) {
      setFixtureError(error instanceof Error ? error.message : "Sports feed unavailable");
    } finally {
      setLoadingFixtures(false);
    }
  }, [sport]);

  const refreshState = useCallback(async () => {
    if (!sessionFixtureId || !player) return;
    try {
      const response = await fetchWithTimeout(
        `/api/sides/state?player=${encodeURIComponent(player)}&fixtureId=${encodeURIComponent(sessionFixtureId)}`,
        { cache: "no-store" },
        8_000
      );
      if (response.ok) {
        setState((await response.json()) as SidesState);
        setNetworkIssue(false);
      }
    } catch {
      setNetworkIssue(true);
    }
  }, [player, sessionFixtureId]);

  const refreshHistory = useCallback(async () => {
    if (!player) {
      setHistory([]);
      return;
    }
    try {
      const response = await fetchWithTimeout(`/api/sides/history?player=${encodeURIComponent(player)}`, {
        cache: "no-store",
      }, 8_000);
      if (response.ok) {
        const body = (await response.json()) as { positions: HistoryPosition[] };
        setHistory(body.positions);
      }
    } catch {
      // History is non-blocking; keep the last stable snapshot and retry on the next poll.
    }
  }, [player]);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      setWalletBalance(0);
      return;
    }
    setWalletBalance(await usdcBalance(connection, publicKey));
  }, [connection, publicKey]);

  useEffect(() => {
    void loadFixtures();
    const timer = setInterval(() => void loadFixtures(), 30_000);
    return () => clearInterval(timer);
  }, [loadFixtures]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId || !fixtures.some((fixture) => fixture.id === selectedId && fixture.sport === sport)) {
      const next =
        fixtures.find((fixture) => fixture.sport === sport && fixture.state === "live") ??
        fixtures.find((fixture) => fixture.sport === sport);
      setSelectedId(next?.id ?? null);
    }
  }, [fixtures, selectedId, sport]);

  useEffect(() => {
    if (!sessionFixtureId) return;
    void refreshState();
    const timer = setInterval(() => void refreshState(), 3_000);
    return () => clearInterval(timer);
  }, [refreshState, sessionFixtureId]);

  useEffect(() => {
    void refreshHistory();
    void refreshBalance();
    if (!player) return;
    const timer = setInterval(() => {
      void refreshHistory();
      void refreshBalance();
    }, 12_000);
    return () => clearInterval(timer);
  }, [player, refreshBalance, refreshHistory]);

  const signIntent = useCallback(
    async (intent: PracticeIntent) => {
      if (!connected || !publicKey || !signMessage) {
        throw new Error("Connect a wallet that supports message signing");
      }
      const signed = await signMessage(new TextEncoder().encode(practiceIntentMessage(intent)));
      return signatureBase64(signed);
    },
    [connected, publicKey, signMessage]
  );

  const joinRoom = async () => {
    if (!selected || !player) return;
    if (selected.state === "upcoming") {
      say("Choose a live game or a completed replay", "error");
      return;
    }
    setPending("start");
    try {
      const intent: PracticeIntent = {
        action: "start",
        player,
        fixtureId: selected.id,
        issuedAt: Date.now(),
        nonce: randomNonce(),
      };
      const signature = await signIntent(intent);
      const response = await fetchWithTimeout("/api/sides/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intent, signature }),
      }, 15_000);
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not join the room");
      setSessionFixtureId(selected.id);
      say("Room joined. Nothing is locked until you approve a USDC transaction.");
    } catch (error) {
      say(error instanceof Error ? error.message : "Signature was cancelled", "error");
    } finally {
      setPending(null);
    }
  };

  const copyRoom = async () => {
    if (!sessionFixtureId) return;
    const url = `${window.location.origin}/sides?room=${encodeURIComponent(sessionFixtureId)}`;
    try {
      await navigator.clipboard.writeText(url);
      say("Room link copied. Anyone opening it joins this exact pool.");
    } catch {
      say(`Copy this room link: ${url}`, "error");
    }
  };

  const confirmEntry = async () => {
    if (!activeRound || !confirmSide || !sessionFixtureId || !publicKey) return;
    if (!ESCROW_READY) {
      say("The escrow program is built but not deployed to devnet yet.", "error");
      return;
    }
    if (walletBalance < stake) {
      say("You need more devnet USDC. Use the test faucet in the right panel.", "error");
      return;
    }
    try {
      setPending("prepare");
      const prepared = await fetchWithTimeout("/api/sides/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: sessionFixtureId, roundId: activeRound.id }),
      }, 45_000);
      const preparedBody = (await prepared.json()) as { error?: string };
      if (!prepared.ok) throw new Error(preparedBody.error ?? "Could not open the devnet vault");

      setPending("wallet");
      const stakeMicro = BigInt(Math.round(stake * 1_000_000));
      const locked = await lockUsdcPosition({
        connection,
        player: publicKey,
        fixtureId: sessionFixtureId,
        roundId: activeRound.id,
        side: confirmSide,
        amountMicro: stakeMicro,
        sendTransaction,
      });
      setPending("record");
      const response = await fetchWithTimeout("/api/sides/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player,
          fixtureId: sessionFixtureId,
          roundId: activeRound.id,
          side: confirmSide,
          stakeMicro: stakeMicro.toString(),
          txSignature: locked.signature,
        }),
      }, 15_000);
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The locked position could not be recorded");
      setConfirmSide(null);
      await Promise.all([refreshState(), refreshHistory(), refreshBalance()]);
      say("Position locked in the shared devnet vault.");
    } catch (error) {
      say(error instanceof Error ? error.message : "Transaction was cancelled", "error");
    } finally {
      setPending(null);
    }
  };

  const cashOutPosition = async () => {
    if (!activeRound || !sessionFixtureId || !player || cashing) return;
    setCashing(true);
    try {
      const intent: PracticeIntent = {
        action: "cashout",
        player,
        fixtureId: sessionFixtureId,
        roundId: activeRound.id,
        issuedAt: Date.now(),
        nonce: randomNonce(),
      };
      const signature = await signIntent(intent);
      const response = await fetchWithTimeout("/api/sides/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intent, signature }),
      }, 15_000);
      const body = (await response.json()) as { error?: string; cashedMicro?: string };
      if (!response.ok) throw new Error(body.error ?? "Cash out failed");
      await Promise.all([refreshState(), refreshHistory()]);
      say(`Cashed out at ${money(body.cashedMicro)} tUSDC — locked in before the whistle.`);
    } catch (error) {
      say(error instanceof Error ? error.message : "Cash out was cancelled", "error");
    } finally {
      setCashing(false);
    }
  };

  const claimPosition = async (position: HistoryPosition) => {
    if (!publicKey || claiming) return;
    setClaiming(position.id);
    try {
      const signature = await claimUsdcPosition({
        connection,
        player: publicKey,
        fixtureId: position.fixtureId,
        roundId: position.id,
        sendTransaction,
      });
      const response = await fetchWithTimeout("/api/sides/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player,
          fixtureId: position.fixtureId,
          roundId: position.id,
          txSignature: signature,
        }),
      }, 15_000);
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Claim could not be recorded");
      }
      await Promise.all([refreshHistory(), refreshState(), refreshBalance()]);
      say("USDC returned to your devnet wallet.");
    } catch (error) {
      say(error instanceof Error ? error.message : "Claim was cancelled", "error");
    } finally {
      setClaiming(null);
    }
  };

  const visibleFixtures = useMemo(
    () => fixtures.filter((fixture) => fixture.sport === sport).slice(0, 8),
    [fixtures, sport]
  );

  return (
    <div className={styles.page}>
      <a href="#sides-main" className={styles.skipLink}>Skip to game</a>
      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={() => {
          setSessionFixtureId(null);
          setState(null);
        }}>NER<span>V</span>E</button>
        <div className={styles.headerCenter}>
          <span className={styles.networkDot} /> Solana devnet
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.navButton} onClick={() => setShowHistory(true)}>
            My positions {history.length > 0 && <b>{history.length}</b>}
          </button>
          <button type="button" className={styles.helpButton} onClick={() => setShowHow(true)}>How it works</button>
          <WalletMultiButton className={styles.walletButton} />
        </div>
      </header>

      <main id="sides-main" className={styles.main}>
        {!sessionFixtureId ? (
          <section className={styles.lobby}>
            <div className={styles.lobbyVideo} aria-hidden>
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster="/media/nerve-stadium-poster.webp"
              >
                <source src="/media/nerve-stadium-loop.mp4" type="video/mp4" />
              </video>
            </div>
            <div className={styles.lobbyIntro}>
              <p className={styles.eyebrow}>Live in-play markets · powered by TxLINE</p>
              <h1>Take a side.<br /><em>Watch it move.</em></h1>
              <p>
                Pick GOAL or NO GOAL on the next real moment. Your price moves live with the match&apos;s own odds — cash out early, or hold for the result. You&apos;re matched against someone on the other side, not the house.
              </p>
              <div className={styles.simpleFlow}>
                <span><b>1</b> Pick a side</span>
                <span><b>2</b> Watch the price move</span>
                <span><b>3</b> Cash out, or settle</span>
              </div>
              <div className={styles.safetyNote}><i />Devnet only. Test tokens have no cash value.</div>
            </div>

            <div className={styles.marketPicker}>
              <div className={styles.pickerHead}>
                <div><small>Choose a live match</small><h2>Games happening now</h2></div>
                <div className={styles.sportTabs}>
                  {(["football", "tennis"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={sport === item ? styles.activeTab : ""}
                      onClick={() => setSport(item)}
                    >{item === "football" ? "Football" : "Tennis"}</button>
                  ))}
                </div>
              </div>
              <div className={styles.fixtureList}>
                {loadingFixtures && [0, 1, 2, 3].map((item) => <div key={item} className={styles.skeleton} />)}
                {!loadingFixtures && fixtureError && (
                  <div className={styles.feedError}><strong>Games could not load</strong><span>{fixtureError}</span></div>
                )}
                {!loadingFixtures && !fixtureError && visibleFixtures.map((fixture) => {
                  const selectedFixture = selectedId === fixture.id;
                  return (
                    <button
                      type="button"
                      key={fixture.id}
                      className={`${styles.fixture} ${selectedFixture ? styles.fixtureSelected : ""}`}
                      onClick={() => setSelectedId(fixture.id)}
                    >
                      <span className={`${styles.fixtureState} ${styles[fixture.state]}`}>
                        {fixture.state === "live" ? "LIVE" : fixture.state === "complete" ? "REPLAY" : "SOON"}
                      </span>
                      <span className={styles.fixtureTeams}>
                        <strong>{compactName(fixture.participantA)}</strong>
                        <small>{compactName(fixture.participantB)}</small>
                      </span>
                      <span className={styles.fixtureInfo}>
                        <strong>{fixtureTime(fixture)}</strong><small>{fixture.competition}</small>
                      </span>
                      <span className={styles.check}>{selectedFixture ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.joinBar}>
                <div><small>Selected room</small><strong>{selected ? `${selected.participantA} vs ${selected.participantB}` : "Choose a game"}</strong></div>
                {!connected ? (
                  <WalletMultiButton className={styles.primaryWalletButton} />
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!selected || selected.state === "upcoming" || pending === "start"}
                    onClick={() => void joinRoom()}
                  >{pending === "start" ? "Check wallet..." : "Join shared room"}<span>→</span></button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.gameShell}>
            <div className={styles.roomBar}>
              <div className={styles.roomIdentity}>
                <span>ROOM</span><strong>{state?.roomCode ?? "------"}</strong>
                <small>Everyone with this link joins the same pool.</small>
              </div>
              <button type="button" onClick={() => void copyRoom()} className={styles.shareButton}>Copy invite link</button>
              {networkIssue && <span className={styles.connectionIssue}><i />Connection paused · retrying</span>}
            </div>

            {sessionFixture && (
              <div className={styles.scoreboard}>
                <span className={`${styles.fixtureState} ${styles[sessionFixture.state]}`}>
                  {sessionFixture.state === "live" ? "LIVE" : "REPLAY"}
                </span>
                <div className={styles.team}><strong>{sessionFixture.participantA}</strong><b>{sessionFixture.state === "complete" ? "-" : sessionFixture.scoreA || "0"}</b></div>
                <div className={styles.versus}><strong>VS</strong><small>{sessionFixture.status}</small></div>
                <div className={`${styles.team} ${styles.teamAway}`}><b>{sessionFixture.state === "complete" ? "-" : sessionFixture.scoreB || "0"}</b><strong>{sessionFixture.participantB}</strong></div>
                <span className={styles.scoreSource}><i />Real scoreboard</span>
              </div>
            )}

            <div className={styles.gameGrid}>
              <div className={styles.arena}>
                {!state ? (
                  <div className={styles.emptyState}><span /><strong>Joining the shared room</strong></div>
                ) : activeRound?.phase === "open" ? (
                  <OpenRound
                    round={activeRound}
                    stake={stake}
                    feeBps={state.feeBps}
                    seconds={timeUntil(activeRound.commitClosesAt, now)}
                    pending={pending}
                    onPick={setConfirmSide}
                  />
                ) : activeRound ? (
                  <LiveRound
                    round={activeRound}
                    seconds={timeUntil(activeRound.windowEndsAt, now)}
                    cashing={cashing}
                    onCashOut={() => void cashOutPosition()}
                  />
                ) : latestResult ? (
                  <ResultRound round={latestResult} />
                ) : (
                  <div className={styles.emptyState}><strong>Preparing the first round</strong></div>
                )}
              </div>

              <aside className={styles.rail}>
                <div className={styles.balanceCard}>
                  <small>Your wallet</small>
                  <strong>{walletBalance.toFixed(2)} <span>tUSDC</span></strong>
                  <p>Real test tokens on Solana devnet.</p>
                  <div className={`${styles.deploymentStatus} ${ESCROW_READY ? styles.deployed : ""}`}>
                    <i />{ESCROW_READY ? "Escrow program live" : "Escrow deployment pending"}
                  </div>
                  <div className={styles.faucetLinks}>
                    <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a>
                    <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Get fee SOL ↗</a>
                  </div>
                </div>
                <div className={styles.stakeCard}>
                  <div><small>Amount to lock</small><strong>{stake} tUSDC</strong></div>
                  <div className={styles.stakeOptions}>
                    {STAKES.map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        className={stake === amount ? styles.stakeActive : ""}
                        onClick={() => setStake(amount)}
                        disabled={!!activeRound?.mine}
                      >{amount}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.peopleCard}>
                  <div><span className={styles.peopleIcon}>◎</span><p><strong>{activeRound?.players ?? 0} joined this round</strong><small>Friends can back your side with their own wallets. The opposite pool supplies the match.</small></p></div>
                  <button type="button" onClick={() => void copyRoom()}>Share room</button>
                </div>
                <button type="button" className={styles.historyShortcut} onClick={() => setShowHistory(true)}>
                  <span>My previous positions</span><b>{history.length}</b>
                </button>
                <div className={styles.railFoot}><i />USDC is held by the room vault, not by this page.</div>
              </aside>
            </div>
          </section>
        )}
      </main>

      {confirmSide && activeRound && state && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button type="button" className={styles.overlayDismiss} onClick={() => !pending && setConfirmSide(null)} aria-label="Cancel" />
          <section className={styles.confirmPanel}>
            <button type="button" className={styles.closeButton} onClick={() => setConfirmSide(null)} disabled={!!pending}>×</button>
            <p className={styles.eyebrow}>Confirm your position</p>
            <h2 id="confirm-title">Lock {stake} tUSDC on {confirmSide === "GOAL" ? activeRound.labelGoal : activeRound.labelNoGoal}?</h2>
            <PayoutMath stake={stake} priceBps={activeRound.priceBps} side={confirmSide} feeBps={state.feeBps} />
            <div className={styles.transactionFacts}>
              <p><span>Where it goes</span><strong>Shared Solana vault</strong></p>
              <p><span>If unmatched</span><strong>Returned when resolved</strong></p>
              <p><span>Friends on your side</span><strong>Each keeps a proportional claim</strong></p>
              <p><span>Network</span><strong>Devnet · test value only</strong></p>
            </div>
            {pending ? (
              <div className={styles.pendingButton}><i />{pendingCopy(pending)}</div>
            ) : (
              <button type="button" className={styles.confirmButton} onClick={() => void confirmEntry()} disabled={!ESCROW_READY}>
                {ESCROW_READY ? `Approve ${stake} tUSDC transaction` : "Devnet deployment pending"} <span>→</span>
              </button>
            )}
          </section>
        </div>
      )}

      {showHistory && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="history-title">
          <button type="button" className={styles.overlayDismiss} onClick={() => setShowHistory(false)} aria-label="Close history" />
          <section className={styles.historyPanel}>
            <div className={styles.panelHead}>
              <div><p className={styles.eyebrow}>Your wallet</p><h2 id="history-title">Position history</h2></div>
              <button type="button" className={styles.closeButton} onClick={() => setShowHistory(false)}>×</button>
            </div>
            {!connected ? (
              <div className={styles.historyEmpty}><strong>Connect your wallet</strong><p>Your positions are indexed by wallet address.</p></div>
            ) : history.length === 0 ? (
              <div className={styles.historyEmpty}><strong>No positions yet</strong><p>Your locked, live and settled rounds will appear here.</p></div>
            ) : (
              <div className={styles.historyList}>
                {history.map((position) => (
                  <HistoryRow
                    key={position.id}
                    position={position}
                    claiming={claiming === position.id}
                    onClaim={() => void claimPosition(position)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {showHow && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="how-title">
          <button type="button" className={styles.overlayDismiss} onClick={() => setShowHow(false)} aria-label="Close instructions" />
          <section className={styles.howPanel}>
            <div className={styles.panelHead}><div><p className={styles.eyebrow}>Simple by design</p><h2 id="how-title">How a shared room works</h2></div><button type="button" className={styles.closeButton} onClick={() => setShowHow(false)}>×</button></div>
            <div className={styles.howSteps}>
              <article><b>01</b><strong>Join the same game</strong><p>Send the room link. Every wallet using it enters the same round and pool.</p></article>
              <article><b>02</b><strong>Build either side</strong><p>Friends may choose together. Each wallet owns its stake; the opposing pool determines how much is matched.</p></article>
              <article><b>03</b><strong>Result, then claim</strong><p>The real game resolves the round. Winners claim the matched pot; unmatched value returns.</p></article>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`} role="status">
          <i />{notice.text}
        </div>
      )}
    </div>
  );
}

function PayoutMath({ stake, priceBps, side, feeBps }: { stake: number; priceBps: number; side: Side; feeBps: number }) {
  const value = payout(stake, priceBps, side, feeBps);
  return (
    <div className={styles.payoutMath}>
      <p><span>Market price</span><strong>{Math.round(value.price * 100)}%</strong></p>
      <p><span>{stake.toFixed(2)} ÷ {value.price.toFixed(2)}</span><strong>{value.gross.toFixed(2)} gross</strong></p>
      <p><span>Protocol fee · {feeBps / 100}%</span><strong>-{value.fee.toFixed(2)}</strong></p>
      <p className={styles.netRow}><span>If correct</span><strong>{value.net.toFixed(2)} tUSDC</strong></p>
    </div>
  );
}

function OpenRound({ round, stake, feeBps, seconds, pending, onPick }: {
  round: RoundView;
  stake: number;
  feeBps: number;
  seconds: number;
  pending: Pending;
  onPick: (side: Side) => void;
}) {
  return (
    <div className={styles.roundOpen}>
      <div className={styles.roundHead}>
        <div>
          <p className={styles.eyebrow}>
            {round.sourceWindow} · choose one
            {round.priceSource === "txline" && (
              <span className={styles.liveOddsBadge} title="This price is set by the live TxLINE odds feed, not a fixed number.">
                <i />Priced from live TxLINE odds
              </span>
            )}
          </p>
          <h1>{round.question}</h1>
        </div>
        <div className={styles.decisionClock}><small>Entries close</small><strong>{clock(seconds)}</strong></div>
      </div>
      <div className={styles.sideGrid}>
        {(["GOAL", "NO_GOAL"] as const).map((side) => {
          const first = side === "GOAL";
          const label = first ? round.labelGoal : round.labelNoGoal;
          const selected = round.mine?.side === side;
          return (
            <button
              type="button"
              key={side}
              className={`${styles.sideCard} ${first ? styles.warmSide : styles.coolSide} ${selected ? styles.selectedSide : ""}`}
              onClick={() => onPick(side)}
              disabled={!!round.mine || !!pending}
            >
              <span className={styles.sideIcon}>{first ? "↗" : "—"}</span>
              <span className={styles.sideLabel}>{label}</span>
              <PayoutMath stake={stake} priceBps={round.priceBps} side={side} feeBps={feeBps} />
              <span className={styles.lockAction}>
                {selected ? `Locked ${money(round.mine?.stake)} tUSDC ✓` : `Lock ${stake} tUSDC on ${label}`}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.matchingNote}>
        <span><i />{round.players} participant{round.players === 1 ? "" : "s"}</span>
        <p><strong>Friends can stack one side.</strong> Every wallet gets its own proportional claim; unmatched USDC comes back.</p>
        <span>{money(round.pot)} tUSDC locked</span>
      </div>
    </div>
  );
}

function LiveRound({
  round,
  seconds,
  cashing,
  onCashOut,
}: {
  round: RoundView;
  seconds: number;
  cashing: boolean;
  onCashOut: () => void;
}) {
  const goal = Number(round.split?.goal ?? 0);
  const noGoal = Number(round.split?.noGoal ?? 0);
  const goalPct = goal + noGoal > 0 ? Math.round((goal / (goal + noGoal)) * 100) : 50;
  const liveGoalPct = Math.round(round.livePriceBps / 100);
  const mine = round.mine;
  const cashed = mine?.cashedMicro != null;
  const multiple = mine?.markMultiple ?? null;
  const markMicro = mine?.markMicro ?? null;
  const stake = mine ? micro(mine.stake) : 0;
  const markValue = markMicro != null ? markMicro / 1_000_000 : 0;
  const up = multiple != null && multiple >= 1;
  const myLabel = mine ? (mine.side === "GOAL" ? round.labelGoal : round.labelNoGoal) : "";
  const mySideProb = mine?.side === "GOAL" ? liveGoalPct : 100 - liveGoalPct;

  if (mine && !cashed && markMicro != null) {
    return (
      <div className={styles.holdStage}>
        <div className={styles.holdTop}>
          <div>
            <p className={styles.eyebrow}>Holding {myLabel} · live</p>
            <h2 className={styles.holdQuestion}>{round.question}</h2>
          </div>
          <div className={styles.decisionClock}>
            <small>Whistle in</small>
            <strong>{clock(seconds)}</strong>
          </div>
        </div>

        <div className={`${styles.holdHero} ${up ? styles.holdUp : styles.holdDown}`}>
          <span className={styles.holdKicker}>Your position, right now</span>
          <div className={styles.holdMultiple}>
            {(multiple ?? 0).toFixed(2)}<span>×</span>
          </div>
          <div className={styles.holdValue}>
            {money(String(markMicro))} tUSDC
            <em>{up ? "▲" : "▼"} from {stake.toFixed(2)} staked</em>
          </div>
          <div className={styles.holdMeter}>
            <span>Live chance of {myLabel.toLowerCase()}</span>
            <b>{Math.max(0, Math.min(100, mySideProb))}%</b>
          </div>
        </div>

        <button
          type="button"
          className={styles.cashOutButton}
          onClick={onCashOut}
          disabled={cashing}
        >
          {cashing ? "Locking in…" : `Cash out ${markValue.toFixed(2)} tUSDC`}
          <span>{up ? "before a goal crashes it" : "cut it before the whistle"}</span>
        </button>
        <p className={styles.holdFoot}>
          Value moves with the live match. Cash out now to lock it, or hold to the whistle for the full result.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.roundLive}>
      <p className={styles.eyebrow}>Live · real outcome unfolding</p>
      <div className={styles.liveClock}>{clock(seconds)}</div>
      <h1>{round.question}</h1>
      <div className={styles.crowdSplit}>
        <div><span><strong>{goalPct}%</strong>{round.labelGoal}</span><span><strong>{100 - goalPct}%</strong>{round.labelNoGoal}</span></div>
        <p><i style={{ width: `${goalPct}%` }} /><b style={{ width: `${100 - goalPct}%` }} /></p>
      </div>
      {cashed && mine ? (
        <div className={styles.myPosition}><small>Cashed out</small><strong>{money(mine.cashedMicro)} tUSDC locked in</strong><a href={`${EXPLORER}/${mine.txSignature}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction ↗</a></div>
      ) : (
        <div className={styles.spectating}>You are watching this round.</div>
      )}
    </div>
  );
}

function ResultRound({ round }: { round: RoundView }) {
  const returned = Number(round.mine?.payout ?? 0) + Number(round.mine?.refund ?? 0);
  const won = round.mine && round.winner === round.mine.side;
  return (
    <div className={styles.resultRound}>
      <p className={styles.eyebrow}>Round resolved</p>
      <span className={styles.resultIcon}>{round.phase === "void" ? "↺" : won ? "✓" : "·"}</span>
      <h1>{round.phase === "void" ? "Position refunded" : won ? "Your side won" : "Result confirmed"}</h1>
      <p>{round.question}</p>
      {round.mine && <div className={styles.resultAmount}><small>Available to claim</small><strong>{money(String(returned))} tUSDC</strong></div>}
      <span className={styles.resultHint}>Open My positions to review and claim.</span>
    </div>
  );
}

function HistoryRow({ position, claiming, onClaim }: { position: HistoryPosition; claiming: boolean; onClaim: () => void }) {
  const cashed = position.phase === "cashed";
  const resolved = position.phase === "settled" || position.phase === "void";
  const won = position.phase === "settled" && position.winner === position.side;
  const status = cashed ? "CASHED" : position.phase === "open" ? "LOCKED" : position.phase === "window" ? "LIVE" : position.phase === "void" ? "REFUNDED" : won ? "WON" : "LOST";
  const phaseClass = cashed ? styles.settled : styles[position.phase];
  return (
    <article className={styles.historyRow}>
      <div className={styles.historyStatus}><span className={phaseClass}>{status}</span><small>{new Date(position.enteredAt).toLocaleDateString()}</small></div>
      <div className={styles.historyMain}><strong>{position.sideLabel}</strong><span>{position.fixture}</span><small>{position.question}</small></div>
      <div className={styles.historyMoney}><small>Locked</small><strong>{money(position.stake)} tUSDC</strong>{(resolved || cashed) && <span>Return {money(position.returned)}</span>}</div>
      <div className={styles.historyActions}>
        {cashed ? (
          <a href={`${EXPLORER}/${position.txSignature}?cluster=devnet`} target="_blank" rel="noreferrer">Cashed out ✓</a>
        ) : resolved && !position.claimSignature ? (
          <button type="button" onClick={onClaim} disabled={claiming}>{claiming ? "Claiming..." : `Claim ${money(position.returned)}`}</button>
        ) : position.claimSignature ? (
          <a href={`${EXPLORER}/${position.claimSignature}?cluster=devnet`} target="_blank" rel="noreferrer">Claimed ↗</a>
        ) : (
          <a href={`${EXPLORER}/${position.txSignature}?cluster=devnet`} target="_blank" rel="noreferrer">Transaction ↗</a>
        )}
      </div>
    </article>
  );
}

export default function SidesPage() {
  return <SolanaProviders><SidesExperience /></SolanaProviders>;
}
