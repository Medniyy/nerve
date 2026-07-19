"use client";

import { GAME_CONFIG, type SessionDurationId } from "@/game/config";
import {
  PossessionEngine,
  type PossessionSnapshot,
} from "@/game/possessionEngine";
import { SoloBots } from "@/game/soloBots";
import { setSoundEnabled } from "@/lib/audio";
import { LiveStream } from "@/streams/live";
import { parseJsonl, ReplayStream } from "@/streams/replay";
import {
  createGuestIdentity,
  loadPersonalBest,
  savePersonalBest,
  useGameStore,
} from "@/store/gameStore";
import { HoldButton } from "@/ui/HoldButton";
import { IntensityMeter } from "@/ui/IntensityMeter";
import { LiveLeaderboard } from "@/ui/LiveLeaderboard";
import { Lobby } from "@/ui/Lobby";
import { MatchStrip } from "@/ui/MatchStrip";
import { SessionResults } from "@/ui/SessionResults";
import { SessionSetup } from "@/ui/SessionSetup";
import { SponsorTicker } from "@/ui/SponsorTicker";
import { Walkthrough } from "@/ui/Walkthrough";
import type { RoomPlayer, RoomState } from "@/room/store";
import { useCallback, useEffect, useRef, useState } from "react";

const WALKTHROUGH_KEY = "nerve-walkthrough-seen";

interface LiveFixture {
  id: number;
  home: string;
  away: string;
  startTime: number;
}

type EnrichedRoom = RoomState & {
  leaderboard?: (RoomState["players"][number] & { rank: number })[];
};

export function GameApp({ roomCode }: { roomCode?: string } = {}) {
  const screen = useGameStore((s) => s.screen);
  const mode = useGameStore((s) => s.mode);
  const speed = useGameStore((s) => s.speed);
  const sessionDurationId = useGameStore((s) => s.sessionDurationId);
  const identity = useGameStore((s) => s.identity);
  const snap = useGameStore((s) => s.snap);
  const soundOn = useGameStore((s) => s.soundOn);
  const personalBest = useGameStore((s) => s.personalBest);
  const setScreen = useGameStore((s) => s.setScreen);
  const setMode = useGameStore((s) => s.setMode);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const setSessionDurationId = useGameStore((s) => s.setSessionDurationId);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const setSnap = useGameStore((s) => s.setSnap);
  const setSoundOn = useGameStore((s) => s.setSoundOn);
  const setPersonalBest = useGameStore((s) => s.setPersonalBest);

  const engineRef = useRef<PossessionEngine | null>(null);
  const replayRef = useRef<ReplayStream | null>(null);
  const soloBotsRef = useRef<SoloBots | null>(null);
  const [soloBoard, setSoloBoard] = useState<RoomPlayer[]>([]);
  const [burn, setBurn] = useState<number | null>(null);
  const prevLostRef = useRef<number | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveFixture, setLiveFixture] = useState<LiveFixture | null>(null);
  const [fixtures, setFixtures] = useState<LiveFixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingMode, setPendingMode] = useState<"replay" | "live">("replay");
  const [room, setRoom] = useState<EnrichedRoom | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoStartedRef = useRef(false);
  const endedHandled = useRef(false);

  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

  useEffect(() => {
    setPersonalBest(loadPersonalBest());
  }, [setPersonalBest]);

  useEffect(() => {
    if (!localStorage.getItem(WALKTHROUGH_KEY)) setShowHelp(true);
  }, []);

  useEffect(() => {
    void fetch("/api/live-status")
      .then((r) => r.json())
      .then(
        (d: {
          liveAvailable?: boolean;
          fixture?: LiveFixture | null;
          fixtures?: LiveFixture[];
        }) => {
          setLiveAvailable(Boolean(d.liveAvailable));
          setLiveFixture(d.fixture ?? null);
          setFixtures(d.fixtures ?? (d.fixture ? [d.fixture] : []));
          setSelectedFixtureId(d.fixture?.id ?? null);
        }
      )
      .catch(() => setLiveAvailable(false));
  }, []);

  const selectedFixture =
    fixtures.find((f) => f.id === selectedFixtureId) ?? liveFixture;

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  // Turnover burn: when a confirmed turnover wipes an unbanked hold, flash + shake.
  useEffect(() => {
    const cur = snap?.lastLostAmount ?? null;
    const prev = prevLostRef.current;
    prevLostRef.current = cur;
    if (cur != null && cur > 0 && prev == null) {
      setBurn(cur);
      const id = setTimeout(() => setBurn(null), 850);
      return () => clearTimeout(id);
    }
  }, [snap?.lastLostAmount]);

  // Room poll
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    const poll = () =>
      fetch(`/api/room/${roomCode}`)
        .then((r) => r.json())
        .then((d: { ok: boolean; room?: EnrichedRoom }) => {
          if (!cancelled && d.ok && d.room) setRoom(d.room);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 400);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomCode]);

  // Reconnect on room entry
  useEffect(() => {
    if (!roomCode || !identity) return;
    void fetch(`/api/room/${roomCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "reconnect",
        playerId: identity.key,
        label: identity.label,
      }),
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; room?: EnrichedRoom }) => {
        if (d.ok && d.room) setRoom(d.room);
      })
      .catch(() => {});
  }, [roomCode, identity]);

  const closeHelp = useCallback(() => {
    localStorage.setItem(WALKTHROUGH_KEY, "1");
    setShowHelp(false);
  }, []);

  const stopGame = useCallback(() => {
    engineRef.current?.detach();
    engineRef.current = null;
    replayRef.current = null;
    setConnecting(false);
    setCountdown(null);
    endedHandled.current = false;
  }, []);

  const finishIfEnded = useCallback(
    (s: PossessionSnapshot) => {
      if (s.phase !== "ended" || endedHandled.current) return;
      endedHandled.current = true;
      const prev = loadPersonalBest();
      savePersonalBest(s.totalScore);
      setPersonalBest(Math.max(prev, s.totalScore));
      setScreen("results");
    },
    [setPersonalBest, setScreen]
  );

  const startSoloSession = useCallback(
    async (feed: "replay" | "live", durationId: SessionDurationId) => {
      if (!identity) return;
      stopGame();
      setMode(feed);
      setScreen("playing");
      setConnecting(true);
      endedHandled.current = false;

      const bots = new SoloBots();
      soloBotsRef.current = bots;
      setSoloBoard(bots.rows());

      const duration = GAME_CONFIG.SESSION_DURATIONS.find((d) => d.id === durationId);

      // Countdown UI
      setCountdown(3);
      await new Promise<void>((resolve) => {
        let n = 3;
        const id = setInterval(() => {
          n -= 1;
          setCountdown(n > 0 ? n : null);
          if (n <= 0) {
            clearInterval(id);
            resolve();
          }
        }, 1000);
      });

      const engine = new PossessionEngine({
        sessionDurationId: durationId,
        sessionDurationMs: duration?.ms ?? null,
        homeTeam:
          feed === "live"
            ? selectedFixture?.home
            : GAME_CONFIG.DEMO_HOME,
        awayTeam:
          feed === "live"
            ? selectedFixture?.away
            : GAME_CONFIG.DEMO_AWAY,
        onSnapshot: (s) => {
          setSnap(s);
          bots.observe(s);
          setSoloBoard(bots.rows());
          finishIfEnded(s);
        },
      });

      if (feed === "replay") {
        const res = await fetch("/recordings/demo-match.jsonl");
        const text = await res.text();
        const lines = parseJsonl(text);
        const stream = new ReplayStream({
          lines,
          speed,
          // Play the demo through once — no looping (a mid-session restart is
          // confusing). When the feed ends, end the session and show results.
          loop: false,
          onEnded: () => engine.finish(),
        });
        replayRef.current = stream;
        engine.attach(stream);
      } else {
        const stream = new LiveStream({
          fixtureId:
            selectedFixture?.id ?? process.env.NEXT_PUBLIC_TXLINE_FIXTURE_ID,
        });
        engine.attach(stream);
      }

      engineRef.current = engine;
      engine.startImmediate();
      setConnecting(false);
    },
    [
      identity,
      stopGame,
      setMode,
      setScreen,
      selectedFixture,
      speed,
      setSnap,
      finishIfEnded,
    ]
  );

  // Multiplayer: mirror room match state into local snap; holds go to server
  useEffect(() => {
    if (!roomCode || !room?.started || !identity) return;
    const me = room.players.find((p) => p.id === identity.key);
    const m = room.match;
    const remaining =
      room.sessionEndsAt != null
        ? Math.max(0, room.sessionEndsAt - Date.now())
        : null;
    const elapsed =
      room.sessionStartedAt != null
        ? Math.max(0, Date.now() - room.sessionStartedAt)
        : 0;

    const roomSnap: PossessionSnapshot = {
      phase: m.phase,
      totalScore: me?.totalScore ?? 0,
      currentHold: me?.currentHold ?? 0,
      holding: me?.holding ?? false,
      holdStatus: me?.status ?? "WAITING",
      pointsPerSecond: m.possessionIntensity
        ? GAME_CONFIG.POINTS_PER_SECOND[m.possessionIntensity]
        : 0,
      intensity: m.possessionIntensity,
      possessionTeam: m.possessionTeam,
      possessionLabel: m.possessionLabel,
      matchMinute: m.matchMinute,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      sessionRemainingMs: remaining,
      sessionElapsedMs: elapsed,
      sessionDurationId: room.sessionDurationId,
      goalFlash: m.goalFlash,
      syncing: m.syncing,
      holdEnabled: !m.syncing && m.phase === "playing",
      streamTs: Date.now(),
      lastLockedAmount: null,
      lastLostAmount: me?.status === "LOST" ? me.currentHold || null : null,
    };
    setSnap(roomSnap);
    setScreen("playing");

    if (room.ended || m.phase === "ended") {
      finishIfEnded({ ...roomSnap, phase: "ended" });
    }
  }, [roomCode, room, identity, setSnap, setScreen, finishIfEnded]);

  // Auto-start room session view when host already started
  useEffect(() => {
    if (!roomCode || !room || !identity || autoStartedRef.current) return;
    if (room.started) {
      autoStartedRef.current = true;
      setScreen("playing");
    }
  }, [roomCode, room, identity, setScreen]);

  useEffect(() => {
    if (mode === "replay" && replayRef.current) {
      replayRef.current.setSpeed(speed);
    }
  }, [speed, mode]);

  useEffect(() => () => stopGame(), [stopGame]);

  const exitToLobby = useCallback(() => {
    stopGame();
    setScreen("lobby");
    autoStartedRef.current = false;
  }, [stopGame, setScreen]);

  const sendHold = useCallback(
    (type: "hold_start" | "hold_release") => {
      if (!roomCode || !identity) return;
      void fetch(`/api/room/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          playerId: identity.key,
          label: identity.label,
        }),
      })
        .then((r) => r.json())
        .then((d: { ok: boolean; room?: EnrichedRoom }) => {
          if (d.ok && d.room) setRoom(d.room);
        })
        .catch(() => {});
    },
    [roomCode, identity]
  );

  const onHoldStart = useCallback(() => {
    if (roomCode) {
      sendHold("hold_start");
      return;
    }
    engineRef.current?.holdStart();
  }, [roomCode, sendHold]);

  const onHoldRelease = useCallback(() => {
    if (roomCode) {
      sendHold("hold_release");
      return;
    }
    engineRef.current?.holdRelease();
  }, [roomCode, sendHold]);

  if (screen === "lobby" && !roomCode) {
    return (
      <>
        <Lobby
          liveAvailable={liveAvailable}
          liveFixture={selectedFixture}
          fixtures={fixtures}
          selectedFixtureId={selectedFixtureId}
          onSelectFixture={setSelectedFixtureId}
          onPlaySolo={() => {
            setPendingMode("replay");
            setScreen("setup");
          }}
          onPlayLive={() => {
            setPendingMode("live");
            setScreen("setup");
          }}
          onHelp={() => setShowHelp(true)}
        />
        {showHelp && <Walkthrough onClose={closeHelp} />}
      </>
    );
  }

  if (screen === "setup" && !roomCode) {
    return (
      <SessionSetup
        mode={pendingMode}
        liveLabel={
          selectedFixture
            ? `${selectedFixture.home} v ${selectedFixture.away}`
            : null
        }
        durationId={sessionDurationId}
        onDuration={setSessionDurationId}
        onConfirm={() =>
          void startSoloSession(pendingMode, sessionDurationId)
        }
        onBack={() => setScreen("lobby")}
      />
    );
  }

  const s = snap;
  const humanRow: RoomPlayer | null =
    s && !roomCode && identity
      ? {
          id: identity.key,
          label: identity.label,
          joinedAt: 0,
          lastSeen: 0,
          totalScore: s.totalScore,
          currentHold: s.currentHold,
          status: s.holdStatus,
          holding: s.holding,
        }
      : null;
  const boardPlayers =
    roomCode && room
      ? room.leaderboard ?? room.players
      : humanRow
        ? [humanRow, ...soloBoard]
        : soloBoard;

  const intensityBg =
    s?.intensity === "HighDanger" || s?.intensity === "Danger"
      ? "bg-danger-scene"
      : "bg-pitch-scene";

  return (
    <div
      className={`game-shell nerve-live grain relative flex min-h-[100dvh] flex-col text-white ${
        burn != null ? "is-burning" : ""
      }`}
    >
      <a className="skip-link" href="#game-action">
        Skip to hold button
      </a>
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${intensityBg}`}
        aria-hidden
      />
      <div className="pitch-turf" aria-hidden />

      {burn != null && (
        <div className="turnover-burn" aria-hidden>
          <div className="turnover-burn-flash" />
          <div className="turnover-burn-text">
            <span>BALL LOST</span>
            <strong>−{Math.floor(burn)}</strong>
          </div>
        </div>
      )}

      <SponsorTicker />

      {(connecting || countdown != null) && (
        <div className="connect-overlay">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/50">
            Synchronizing TxLINE
          </p>
          <strong className="font-display text-7xl text-volt">
            {countdown ?? "…"}
          </strong>
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
            onHelp={() => setShowHelp(true)}
            roomCode={roomCode}
          />
        </div>
      )}

      <main
        className={`live-layout relative z-10 mx-auto grid w-full flex-1 grid-cols-1 gap-6 px-4 ${
          boardPlayers.length > 0
            ? "max-w-[860px] lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center lg:gap-8"
            : "max-w-[600px]"
        }`}
      >
        <div className="live-primary flex flex-col items-center justify-center px-2 pb-4">
          {s ? (
            <>
              <IntensityMeter intensity={s.intensity} syncing={s.syncing} />

              <div id="game-action" className="mt-4 w-full max-w-sm">
                <HoldButton
                  holding={s.holding}
                  enabled={s.holdEnabled && s.phase === "playing"}
                  currentHold={s.currentHold}
                  pointsPerSecond={s.pointsPerSecond}
                  intensity={s.intensity}
                  syncing={s.syncing || s.phase === "syncing"}
                  lostAmount={s.lastLostAmount}
                  lockedAmount={s.lastLockedAmount}
                  onHoldStart={onHoldStart}
                  onHoldRelease={onHoldRelease}
                />
              </div>

              <div className="score-strip mt-5 flex w-full max-w-sm justify-between gap-4">
                <div>
                  <span>Total Score</span>
                  <strong>{s.totalScore.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Current Hold</span>
                  <strong className="text-volt">
                    {s.currentHold.toFixed(s.currentHold >= 10 ? 0 : 1)}
                  </strong>
                </div>
                {!roomCode && (
                  <div>
                    <span>Best</span>
                    <strong>{personalBest.toLocaleString()}</strong>
                  </div>
                )}
              </div>

              {s.phase === "goal_pause" && s.goalFlash && (
                <div className="goal-banner">
                  GOAL · +{Math.floor(s.goalFlash.locked)} locked
                </div>
              )}
            </>
          ) : (
            <div className="feed-skeleton" aria-label="Loading match feed">
              <span />
              <span />
              <span />
              <p>Connecting to the match…</p>
            </div>
          )}
        </div>

        {boardPlayers.length > 0 && (
          <aside className="board-rail w-full max-w-sm mx-auto lg:mx-0 lg:max-w-none">
            <LiveLeaderboard players={boardPlayers} selfId={identity?.key} />
            <button
              type="button"
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white/70"
              onClick={() => setSoundOn(!soundOn)}
            >
              Sound {soundOn ? "on" : "off"}
            </button>
          </aside>
        )}
      </main>

      {showHelp && <Walkthrough onClose={closeHelp} />}

      {screen === "results" && s && (
        <SessionResults
          totalScore={s.totalScore}
          personalBest={Math.max(personalBest, s.totalScore)}
          homeTeam={s.homeTeam}
          awayTeam={s.awayTeam}
          homeScore={s.homeScore}
          awayScore={s.awayScore}
          isNewBest={s.totalScore >= personalBest && s.totalScore > 0}
          onAgain={() => {
            if (roomCode) {
              exitToLobby();
              return;
            }
            void startSoloSession(mode, sessionDurationId);
          }}
          onLobby={exitToLobby}
        />
      )}
    </div>
  );
}
