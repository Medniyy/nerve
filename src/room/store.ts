import { randomBytes } from "crypto";

export interface RoomPlayer {
  id: string;
  label: string;
  balance: number;
  joinedAt: number;
  lastSeen: number;
}

export interface RoomState {
  code: string;
  mode: "replay" | "live";
  maxPlayers: number;
  createdAt: number;
  players: RoomPlayer[];
}

const MAX_PLAYERS = 5;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const g = globalThis as unknown as { __nerveRooms?: Map<string, RoomState> };
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

export function createRoom(mode: "replay" | "live", hostId: string, hostLabel: string): RoomState {
  const code = generateCode();
  const now = Date.now();
  const room: RoomState = {
    code,
    mode,
    maxPlayers: MAX_PLAYERS,
    createdAt: now,
    players: [{ id: hostId, label: hostLabel, balance: 0, joinedAt: now, lastSeen: now }],
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

export function joinRoom(code: string, playerId: string, label: string): JoinResult {
  const room = ROOMS.get(code.toUpperCase());
  if (!room) return { ok: false, error: "not_found" };
  const now = Date.now();
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.label = label;
    existing.lastSeen = now;
    return { ok: true, room };
  }
  if (room.players.length >= room.maxPlayers) return { ok: false, error: "full" };
  room.players.push({ id: playerId, label, balance: 0, joinedAt: now, lastSeen: now });
  return { ok: true, room };
}

export type ScoreResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: "not_found" };

export function reportScore(
  code: string,
  playerId: string,
  label: string,
  balance: number
): ScoreResult {
  const room = ROOMS.get(code.toUpperCase());
  if (!room) return { ok: false, error: "not_found" };
  const now = Date.now();
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.label = label;
    existing.balance = balance;
    existing.lastSeen = now;
  } else if (room.players.length < room.maxPlayers) {
    room.players.push({ id: playerId, label, balance, joinedAt: now, lastSeen: now });
  }
  return { ok: true, room };
}
