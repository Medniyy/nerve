/**
 * Server-authoritative multiplayer session.
 * Clients send HOLD_START / HOLD_RELEASE only; server owns scoring.
 */

import fs from "node:fs";
import path from "node:path";
import { GAME_CONFIG } from "@/game/config";
import { PossessionEngine } from "@/game/possessionEngine";
import {
  getRoom,
  markSessionEnded,
  markSessionStarted,
  setRoomMatch,
  updatePlayerScore,
  type RoomState,
} from "@/room/store";
import { LiveStream } from "@/streams/live";
import { parseJsonl, ReplayStream } from "@/streams/replay";
import type { MatchEvent, MatchStream } from "@/streams/types";

interface ActiveSession {
  code: string;
  engines: Map<string, PossessionEngine>;
  stream: MatchStream;
  tickTimer: ReturnType<typeof setInterval>;
  unsub: () => void;
  startedAt: number;
  lastEvent: MatchEvent | null;
}

const g = globalThis as unknown as {
  __nerveSessions?: Map<string, ActiveSession>;
};
const SESSIONS =
  g.__nerveSessions ?? (g.__nerveSessions = new Map<string, ActiveSession>());

function loadDemoLines() {
  const candidates = [
    path.join(process.cwd(), "public", "recordings", "demo-match.jsonl"),
    path.join(process.cwd(), "recordings", "demo-match.jsonl"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return parseJsonl(fs.readFileSync(p, "utf8"));
    }
  }
  return [];
}

function syncPlayerToRoom(code: string, playerId: string, eng: PossessionEngine) {
  const snap = eng.getSnapshot();
  updatePlayerScore(code, playerId, {
    totalScore: snap.totalScore,
    currentHold: snap.currentHold,
    status: snap.holdStatus,
    holding: snap.holding,
  });
  return snap;
}

function syncMatchFromEngine(code: string, eng: PossessionEngine) {
  const snap = eng.getSnapshot();
  setRoomMatch(code, {
    homeTeam: snap.homeTeam,
    awayTeam: snap.awayTeam,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    matchMinute: snap.matchMinute,
    possessionTeam: snap.possessionTeam,
    possessionIntensity: snap.intensity,
    possessionLabel: snap.possessionLabel,
    syncing: snap.syncing,
    phase: snap.phase,
    goalFlash: snap.goalFlash,
  });
  if (snap.phase === "ended") {
    markSessionEnded(code);
  }
}

function createPlayerEngine(
  room: RoomState,
  playerId: string,
  startedAt: number,
  totalScore = 0
): PossessionEngine {
  const eng = new PossessionEngine({
    sessionDurationId: room.sessionDurationId,
    sessionDurationMs: room.sessionDurationMs,
    sessionStartedAt: startedAt,
    homeTeam: room.match.homeTeam,
    awayTeam: room.match.awayTeam,
    externalTick: true,
  });
  eng.restoreTotalScore(totalScore);
  return eng;
}

export function getActiveSession(code: string): ActiveSession | undefined {
  return SESSIONS.get(code.toUpperCase());
}

export function startRoomSession(code: string): RoomState | null {
  const room = getRoom(code);
  if (!room) return null;
  if (SESSIONS.has(room.code)) return room;
  if (room.ended) return room;

  const lines = room.mode === "replay" ? loadDemoLines() : [];
  let stream: MatchStream;
  if (room.mode === "live") {
    stream = new LiveStream({
      fixtureId: room.fixtureId ?? process.env.NEXT_PUBLIC_TXLINE_FIXTURE_ID,
    });
  } else {
    stream = new ReplayStream({
      lines,
      speed: 2,
      loop: false,
    });
  }

  const startedAt = Date.now();
  const endsAt =
    room.sessionDurationMs != null ? startedAt + room.sessionDurationMs : null;
  markSessionStarted(room.code, startedAt, endsAt);

  const engines = new Map<string, PossessionEngine>();
  for (const p of room.players) {
    engines.set(p.id, createPlayerEngine(room, p.id, startedAt, p.totalScore));
  }

  const hostEng =
    engines.get(room.hostId) ??
    engines.values().next().value ??
    createPlayerEngine(room, room.hostId, startedAt);

  const session: ActiveSession = {
    code: room.code,
    engines,
    stream,
    tickTimer: null as unknown as ReturnType<typeof setInterval>,
    unsub: () => {},
    startedAt,
    lastEvent: null,
  };

  session.unsub = stream.subscribe((ev) => {
    session.lastEvent = ev;
    for (const [pid, eng] of engines) {
      eng.__testInjectEvent(ev);
      syncPlayerToRoom(room.code, pid, eng);
    }
    syncMatchFromEngine(room.code, hostEng);
  });

  stream.start();

  session.tickTimer = setInterval(() => {
    const current = getRoom(room.code);
    if (!current) return;

    for (const p of current.players) {
      if (!engines.has(p.id)) {
        const eng = createPlayerEngine(
          current,
          p.id,
          session.startedAt,
          p.totalScore
        );
        engines.set(p.id, eng);
        if (session.lastEvent) eng.__testInjectEvent(session.lastEvent);
      }
    }

    for (const [pid, eng] of engines) {
      eng.__testTick();
      syncPlayerToRoom(room.code, pid, eng);
    }
    syncMatchFromEngine(room.code, hostEng);

    if (hostEng.getSnapshot().phase === "ended") {
      stopRoomSession(room.code);
    }
  }, GAME_CONFIG.TICK_MS);

  SESSIONS.set(room.code, session);
  return getRoom(room.code) ?? room;
}

export function stopRoomSession(code: string): void {
  const key = code.toUpperCase();
  const session = SESSIONS.get(key);
  if (!session) return;
  clearInterval(session.tickTimer);
  session.unsub();
  session.stream.stop();
  for (const eng of session.engines.values()) {
    eng.detach();
  }
  SESSIONS.delete(key);
  markSessionEnded(key);
}

export type HoldActionResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: "not_found" | "not_started" | "ended" | "no_player" };

export function holdStart(
  code: string,
  playerId: string
): HoldActionResult {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "not_found" };
  if (!room.started) return { ok: false, error: "not_started" };
  if (room.ended) return { ok: false, error: "ended" };

  let session = SESSIONS.get(room.code);
  if (!session) {
    startRoomSession(room.code);
    session = SESSIONS.get(room.code);
  }
  if (!session) return { ok: false, error: "not_found" };

  let eng = session.engines.get(playerId);
  if (!eng) {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) return { ok: false, error: "no_player" };
    eng = createPlayerEngine(room, playerId, session.startedAt, p.totalScore);
    if (session.lastEvent) eng.__testInjectEvent(session.lastEvent);
    session.engines.set(playerId, eng);
  }

  eng.holdStart();
  syncPlayerToRoom(room.code, playerId, eng);
  return { ok: true, room: getRoom(room.code)! };
}

export function holdRelease(
  code: string,
  playerId: string
): HoldActionResult {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "not_found" };
  const session = SESSIONS.get(room.code);
  if (!session) return { ok: false, error: "not_started" };
  const eng = session.engines.get(playerId);
  if (!eng) return { ok: false, error: "no_player" };
  eng.holdRelease();
  syncPlayerToRoom(room.code, playerId, eng);
  return { ok: true, room: getRoom(room.code)! };
}

export function cancelPlayerHold(code: string, playerId: string): void {
  const session = SESSIONS.get(code.toUpperCase());
  const eng = session?.engines.get(playerId);
  if (eng) {
    eng.cancelHold();
    syncPlayerToRoom(code, playerId, eng);
  }
}
