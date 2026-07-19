"use client";

import { GAME_CONFIG } from "@/game/config";
import { GameEngine, type EngineSnapshot } from "@/game/engine";
import {
  playCrashSting,
  setSoundEnabled,
  startHeartbeat,
  stopHeartbeat,
} from "@/lib/audio";
import {
  fetchLeaderboard,
  submitScore,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { LiveStream } from "@/streams/live";
import { parseJsonl, ReplayStream } from "@/streams/replay";
import {
  createGuestIdentity,
  loadBalance,
  saveBalance,
  useGameStore,
} from "@/store/gameStore";
import { ActionButton } from "@/ui/ActionButton";
import { CrashOverlay } from "@/ui/CrashOverlay";
import { DangerMeter } from "@/ui/DangerMeter";
import { Lobby } from "@/ui/Lobby";
import { LiveCrowd } from "@/ui/LiveCrowd";
import { MatchEndOverlay } from "@/ui/MatchEndOverlay";
import { MatchStrip } from "@/ui/MatchStrip";
import { MultiplierDisplay } from "@/ui/MultiplierDisplay";
import { BoardPanel } from "@/ui/SideRail";
import { Walkthrough } from "@/ui/Walkthrough";
import type { RoomState } from "@/room/store";
import { useCallback, useEffect, useRef, useState } from "react";

const WALKTHROUGH_KEY = "nerve-walkthrough-seen";

interface LiveFixture {
  id: number;
  home: string;
  away: string;
  startTime: number;
}

export function GameApp({ roomCode }: { roomCode?: string } = {}) {
  const screen = useGameStore((s) => s.screen);
  const mode = useGameStore((s) => s.mode);
  const speed = useGameStore((s) => s.speed);
  const identity = useGameStore((s) => s.identity);
  const snap = useGameStore((s) => s.snap);
  const soundOn = useGameStore((s) => s.soundOn);
  const crashing = useGameStore((s) => s.crashing);
  const setScreen = useGameStore((s) => s.setScreen);
  const setMode = useGameStore((s) => s.setMode);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const setSnap = useGameStore((s) => s.setSnap);
  const setSoundOn = useGameStore((s) => s.setSoundOn);
  const setCrashing = useGameStore((s) => s.setCrashing);

  const engineRef = useRef<GameEngine | null>(null);
  const replayRef = useRef<ReplayStream | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveFixture, setLiveFixture] = useState<LiveFixture | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [showCrash, setShowCrash] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const lastCrashKey = useRef<string | null>(null);
  const autoStartedRef = useRef(false);

  // Zero-friction start: everyone gets a guest identity immediately.
  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

  // First visit → ELI5 walkthrough
  useEffect(() => {
    if (!localStorage.getItem(WALKTHROUGH_KEY)) setShowHelp(true);
  }, []);

  // Room mode: poll shared roster + leaderboard while roomCode is set.
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    const poll = () =>
      fetch(`/api/room/${roomCode}`)
        .then((r) => r.json())
        .then((d: { ok: boolean; room?: RoomState }) => {
          if (!cancelled && d.ok && d.room) setRoom(d.room);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomCode]);

  const closeHelp = useCallback(() => {
    localStorage.setItem(WALKTHROUGH_KEY, "1");
    setShowHelp(false);
  }, []);

  useEffect(() => {
    void fetch("/api/live-status")
      .then((r) => r.json())
      .then((d: { liveAvailable?: boolean; fixture?: LiveFixture | null }) => {
        setLiveAvailable(Boolean(d.liveAvailable));
        setLiveFixture(d.fixture ?? null);
      })
      .catch(() => setLiveAvailable(false));
    void fetchLeaderboard().then(setBoard);
  }, []);

  useEffect(() => {
    setSoundEnabled(soundOn);
    if (!soundOn) stopHeartbeat();
  }, [soundOn]);

  useEffect(() => {
    if (!snap || !soundOn) return;
    if (snap.phase === "open" || snap.phase === "holding") {
      startHeartbeat(snap.dangerLevel);
    } else {
      stopHeartbeat();
    }
  }, [snap?.dangerLevel, snap?.phase, soundOn, snap]);

  const persist = useCallback(
    async (s: EngineSnapshot) => {
      if (!identity) return;
      saveBalance(identity.key, s.balance);
      const entries = await submitScore({
        key: identity.key,
        label: identity.label,
        balance: s.balance,
      });
      setBoard(entries);
      if (roomCode) {
        fetch(`/api/room/${roomCode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "score",
            playerId: identity.key,
            label: identity.label,
            balance: s.balance,
          }),
        })
          .then((r) => r.json())
          .then((d: { ok: boolean; room?: RoomState }) => {
            if (d.ok && d.room) setRoom(d.room);
          })
          .catch(() => {});
      }
    },
    [identity, roomCode]
  );

  const stopGame = useCallback(() => {
    engineRef.current?.detach();
    engineRef.current = null;
    replayRef.current = null;
    stopHeartbeat();
    setCrashing(false);
    setShowCrash(false);
    setShowBoard(false);
    lastCrashKey.current = null;
  }, [setCrashing]);

  const startReplay = useCallback(async () => {
    if (!identity) return;
    stopGame();
    setMode("replay");
    setScreen("playing");

    const res = await fetch("/recordings/demo-match.jsonl");
    const text = await res.text();
    const lines = parseJsonl(text);
    const balance = loadBalance(identity.key, GAME_CONFIG.STARTING_BALANCE);

    const stream = new ReplayStream({
      lines,
      speed,
      loop: false,
      onEnded: () => {
        /* stay on final state */
      },
    });
    replayRef.current = stream;

    const engine = new GameEngine({
      balance,
      playerName: identity.label,
      onIntermissionStart: () => stream.pause(),
      onIntermissionEnd: () => stream.resume(),
      onSnapshot: (s) => {
        setSnap(s);
        if (
          s.phase === "crashed" &&
          s.lastResult?.reason === "goal"
        ) {
          const key = `${s.lastResult.goalMinute}-${s.lastResult.finalMultiplier}`;
          if (lastCrashKey.current !== key) {
            lastCrashKey.current = key;
            setCrashing(true);
            setShowCrash(true);
            playCrashSting();
            setTimeout(() => setCrashing(false), 400);
            setTimeout(() => setShowCrash(false), 3500);
            void persist(s);
          }
        }
        if (s.phase === "waiting" || s.phase === "open") {
          void persist(s);
        }
      },
    });

    engineRef.current = engine;
    engine.attach(stream);
    engine.start();
  }, [
    identity,
    persist,
    setCrashing,
    setMode,
    setScreen,
    setSnap,
    speed,
    stopGame,
  ]);

  const startLive = useCallback(() => {
    if (!identity) return;
    stopGame();
    setMode("live");
    setScreen("playing");
    const balance = loadBalance(identity.key, GAME_CONFIG.STARTING_BALANCE);
    const engine = new GameEngine({
      balance,
      playerName: identity.label,
      homeTeam: liveFixture?.home || undefined,
      awayTeam: liveFixture?.away || undefined,
      onSnapshot: (s) => {
        setSnap(s);
        if (s.phase === "crashed" && s.lastResult?.reason === "goal") {
          const key = `${s.lastResult.goalMinute}-${s.homeScore}-${s.awayScore}`;
          if (lastCrashKey.current !== key) {
            lastCrashKey.current = key;
            setCrashing(true);
            setShowCrash(true);
            playCrashSting();
            setTimeout(() => setCrashing(false), 400);
            setTimeout(() => setShowCrash(false), 3500);
            void persist(s);
          }
        }
      },
    });
    const stream = new LiveStream({
      fixtureId:
        liveFixture?.id ?? process.env.NEXT_PUBLIC_TXLINE_FIXTURE_ID,
    });
    engineRef.current = engine;
    engine.attach(stream);
    engine.start();
  }, [
    identity,
    liveFixture,
    persist,
    setCrashing,
    setMode,
    setScreen,
    setSnap,
    stopGame,
  ]);

  // Room mode: auto-start once identity + room are ready, skipping the manual lobby.
  useEffect(() => {
    if (!roomCode || !room || !identity || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (room.mode === "live") {
      startLive();
    } else {
      void startReplay();
    }
  }, [roomCode, room, identity, startLive, startReplay]);

  useEffect(() => {
    if (mode === "replay" && replayRef.current) {
      replayRef.current.setSpeed(speed);
    }
  }, [speed, mode]);

  useEffect(() => {
    return () => stopGame();
  }, [stopGame]);

  const exitToLobby = useCallback(() => {
    stopGame();
    setScreen("lobby");
  }, [stopGame, setScreen]);

  const activeBoard: LeaderboardEntry[] =
    roomCode && room
      ? [...room.players]
          .sort((a, b) => b.balance - a.balance)
          .map((p) => ({ key: p.id, label: p.label, balance: p.balance }))
      : board;

  if (screen === "lobby") {
    return (
      <>
        <Lobby
          liveAvailable={liveAvailable}
          liveFixture={liveFixture}
          onPlayReplay={() => void startReplay()}
          onPlayLive={startLive}
          onHelp={() => setShowHelp(true)}
        />
        {showHelp && <Walkthrough onClose={closeHelp} />}
      </>
    );
  }

  const s = snap;
  const critical = s?.dangerZone === "CRITICAL";
  const matchOver =
    s?.phase === "waiting" && s.lastResult?.reason === "fulltime";

  return (
    <div
      className={`game-shell grain relative flex min-h-[100dvh] flex-col text-white ${
        crashing ? "animate-shake" : ""
      }`}
    >
      <a className="skip-link" href="#game-action">Skip to game action</a>
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          critical ? "bg-danger-scene" : "bg-pitch-scene"
        }`}
        aria-hidden
      />

      {roomCode && room && (
        <div className="room-banner relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between px-4 py-1 font-mono text-[11px] text-white/60">
          <span>
            Room <strong className="text-volt">{roomCode}</strong> · {room.players.length}/{room.maxPlayers}
          </span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${roomCode}`)}
            className="text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/80"
          >
            Copy invite link
          </button>
        </div>
      )}

      {s && (
        <div className="relative z-10">
          <MatchStrip
            snap={s}
            mode={mode}
            speed={speed}
            onSpeed={setSpeed}
            onExit={exitToLobby}
            onOpenBoard={() => setShowBoard(true)}
            onHelp={() => setShowHelp(true)}
          />
        </div>
      )}

      <main className="game-layout relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5 lg:px-5">
        <div className="game-primary">
          {s ? (
            <>
              <MultiplierDisplay snap={s} crashing={crashing} />
              <div className="round-streak" aria-label="Recent rounds">
                <div className="round-balance">
                  <span>Balance</span>
                  <strong>{s.balance.toLocaleString()} pts</strong>
                </div>
                <div className="round-history">
                  <span className="round-label">Recent</span>
                  {(s.roundHistory.length
                    ? s.roundHistory.slice(0, 5)
                    : [
                        { label: "2.41x", ok: true },
                        { label: "CRASH", ok: false },
                        { label: "1.18x", ok: true },
                      ]
                  ).map((h, i) => (
                    <span
                      key={`${h.label}-${i}`}
                      className={h.ok ? "round-pill is-safe" : "round-pill is-crash"}
                    >
                      {h.ok ? "✓ " : ""}{h.label.replace("x", "×")}
                    </span>
                  ))}
                </div>
              </div>

              <DangerMeter
                level={s.dangerLevel}
                zone={s.dangerZone}
                cause={s.dangerCause}
              />
              <LiveCrowd snap={s} />
            </>
          ) : (
            <div className="feed-skeleton" aria-label="Loading match feed">
              <span /><span /><span />
              <p>Connecting to the match…</p>
            </div>
          )}
        </div>

        {s && (
          <aside className="board-rail hidden p-5 lg:my-3 lg:block">
            <BoardPanel
              snap={s}
              board={activeBoard}
              playerKey={identity?.key}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn(!soundOn)}
            />
          </aside>
        )}
      </main>

      {/* Thumb zone: fixed action bar */}
      {s && (
        <div id="game-action" className="action-dock relative z-10 mx-auto w-full max-w-lg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ActionButton
            holding={s.holding}
            canAct={s.phase === "open" || s.phase === "holding"}
            phase={s.phase}
            stake={GAME_CONFIG.STAKE}
            payout={Math.floor(s.stake * s.multiplier)}
            onHold={() => engineRef.current?.hold()}
            onCashOut={() => {
              engineRef.current?.cashOut();
              const next = engineRef.current?.getSnapshot();
              if (next) void persist(next);
            }}
          />
          <p className="action-hint">
            {s.phase === "open"
              ? "Tap HOLD to join this round with 100 pts"
              : s.phase === "holding"
                ? "Cash out before a goal — or lose your stake"
                : s.phase === "crashed"
                  ? "Goal! Everyone still holding lost their stake"
                  : "Waiting for the next round…"}
          </p>
        </div>
      )}

      {/* Mobile board sheet */}
      {showBoard && s && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setShowBoard(false)}
        >
          <div
            className="sheet-up max-h-[75dvh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <BoardPanel
              snap={s}
              board={activeBoard}
              playerKey={identity?.key}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn(!soundOn)}
            />
          </div>
        </div>
      )}

      {showCrash && s?.lastResult && (
        <CrashOverlay
          result={s.lastResult}
          homeTeam={s.homeTeam}
          awayTeam={s.awayTeam}
          onDismiss={() => setShowCrash(false)}
        />
      )}

      {showHelp && <Walkthrough onClose={closeHelp} />}

      {matchOver && s && !showCrash && (
        <MatchEndOverlay
          homeTeam={s.homeTeam}
          awayTeam={s.awayTeam}
          homeScore={s.homeScore}
          awayScore={s.awayScore}
          balance={s.balance}
          onPlayAgain={() =>
            mode === "live" ? startLive() : void startReplay()
          }
          onLobby={exitToLobby}
        />
      )}
    </div>
  );
}
