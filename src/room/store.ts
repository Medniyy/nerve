import { randomBytes } from "crypto";
import { GAME_CONFIG, type SessionDurationId } from "@/game/config";
import type { HoldStatus, SessionPhase } from "@/game/possessionEngine";
import type { PossessionIntensity } from "@/game/config";

export type PlayerLiveStatus = HoldStatus;

export interface RoomPlayer {
  id: string;
  label: string;
  joinedAt: number;
  lastSeen: number;
  totalScore: number;
  currentHold: number;
  status: PlayerLiveStatus;
  holding: boolean;
}

export interface RoomMatchState {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchMinute: number;
  possessionTeam: "home" | "away" | null;
  possessionIntensity: PossessionIntensity | null;
  possessionLabel: string;
  syncing: boolean;
  phase: SessionPhase;
  goalFlash: { team: "home" | "away"; locked: number } | null;
}

export interface RoomState {
  code: string;
  mode: "replay" | "live";
  maxPlayers: number;
  createdAt: number;
  hostId: string;
  fixtureId?: number;
  sessionDurationId: SessionDurationId;
  sessionDurationMs: number | null;
  sessionStartedAt: number | null;
  sessionEndsAt: number | null;
  started: boolean;
  ended: boolean;
  players: RoomPlayer[];
  match: RoomMatchState;
}

const MAX_PLAYERS = GAME_CONFIG.MAX_PLAYERS;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const g = globalThis as unknown as {
  __nerveRooms?: Map<string, RoomState>;
};
const ROOMS = g.__nerveRooms ?? (g.__nerveRooms = new Map<string, RoomState>());

function generateCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(5);
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    if (!ROOMS.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code");
}

export function blankMatchState(): RoomMatchState {
  return {
    homeTeam: GAME_CONFIG.DEMO_HOME,
    awayTeam: GAME_CONFIG.DEMO_AWAY,
    homeScore: 0,
    awayScore: 0,
    matchMinute: 0,
    possessionTeam: null,
    possessionIntensity: null,
    possessionLabel: "SYNCING LIVE POSSESSION",
    syncing: true,
    phase: "connecting",
    goalFlash: null,
  };
}

function newPlayer(id: string, label: string, now: number): RoomPlayer {
  return {
    id,
    label,
    joinedAt: now,
    lastSeen: now,
    totalScore: 0,
    currentHold: 0,
    status: "WAITING",
    holding: false,
  };
}

export interface CreateRoomOptions {
  mode: "replay" | "live";
  hostId: string;
  hostLabel: string;
  sessionDurationId?: SessionDurationId;
  fixtureId?: number;
}

export function createRoom(opts: CreateRoomOptions): RoomState {
  const code = generateCode();
  const now = Date.now();
  const durationId = opts.sessionDurationId ?? "5m";
  const duration = GAME_CONFIG.SESSION_DURATIONS.find((d) => d.id === durationId);
  const room: RoomState = {
    code,
    mode: opts.mode,
    maxPlayers: MAX_PLAYERS,
    createdAt: now,
    hostId: opts.hostId,
    fixtureId: opts.fixtureId,
    sessionDurationId: durationId,
    sessionDurationMs: duration?.ms ?? null,
    sessionStartedAt: null,
    sessionEndsAt: null,
    started: false,
    ended: false,
    players: [newPlayer(opts.hostId, opts.hostLabel, now)],
    match: blankMatchState(),
  };
  ROOMS.set(code, room);
  return room;
}

export function getRoom(code: string): RoomState | undefined {
  return ROOMS.get(code.toUpperCase());
}

export type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: "not_found" | "full" };

export function joinRoom(
  code: string,
  playerId: string,
  label: string
): JoinResult {
  const room = ROOMS.get(code.toUpperCase());
  if (!room) return { ok: false, error: "not_found" };
  const now = Date.now();
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.label = label;
    existing.lastSeen = now;
    // Reconnect: cancel any interrupted hold; keep totalScore
    if (existing.holding) {
      existing.holding = false;
      existing.currentHold = 0;
      existing.status = "WAITING";
    }
    return { ok: true, room };
  }
  if (room.players.length >= room.maxPlayers) return { ok: false, error: "full" };
  room.players.push(newPlayer(playerId, label, now));
  return { ok: true, room };
}

export function touchPlayer(
  code: string,
  playerId: string,
  label?: string
): RoomState | undefined {
  const room = getRoom(code);
  if (!room) return undefined;
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return undefined;
  p.lastSeen = Date.now();
  if (label) p.label = label;
  return room;
}

export function updatePlayerScore(
  code: string,
  playerId: string,
  patch: Partial<
    Pick<RoomPlayer, "totalScore" | "currentHold" | "status" | "holding">
  >
): RoomState | undefined {
  const room = getRoom(code);
  if (!room) return undefined;
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return undefined;
  Object.assign(p, patch);
  p.lastSeen = Date.now();
  return room;
}

export function setRoomMatch(code: string, match: Partial<RoomMatchState>): void {
  const room = getRoom(code);
  if (!room) return;
  room.match = { ...room.match, ...match };
}

export function markSessionStarted(
  code: string,
  startedAt: number,
  endsAt: number | null
): RoomState | undefined {
  const room = getRoom(code);
  if (!room) return undefined;
  room.started = true;
  room.sessionStartedAt = startedAt;
  room.sessionEndsAt = endsAt;
  room.match.phase = "playing";
  return room;
}

export function markSessionEnded(code: string): RoomState | undefined {
  const room = getRoom(code);
  if (!room) return undefined;
  room.ended = true;
  room.match.phase = "ended";
  for (const p of room.players) {
    if (p.holding || p.currentHold > 0) {
      p.totalScore += Math.floor(p.currentHold);
      p.currentHold = 0;
      p.holding = false;
      p.status = "LOCKED";
    }
  }
  return room;
}

/** Ranked leaderboard view */
export function rankedPlayers(room: RoomState): (RoomPlayer & { rank: number })[] {
  const sorted = [...room.players].sort((a, b) => {
    const ta = a.totalScore + (a.holding ? a.currentHold : 0);
    const tb = b.totalScore + (b.holding ? b.currentHold : 0);
    return tb - ta;
  });
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}
