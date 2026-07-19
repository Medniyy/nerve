import { create } from "zustand";
import type { EngineSnapshot } from "@/game/engine";

export type AppScreen = "lobby" | "playing";
export type FeedMode = "replay" | "live";

export interface PlayerIdentity {
  key: string;
  label: string;
  kind: "wallet" | "guest";
}

interface GameStore {
  screen: AppScreen;
  mode: FeedMode;
  speed: number;
  identity: PlayerIdentity | null;
  snap: EngineSnapshot | null;
  soundOn: boolean;
  crashing: boolean;
  setScreen: (s: AppScreen) => void;
  setMode: (m: FeedMode) => void;
  setSpeed: (n: number) => void;
  setIdentity: (id: PlayerIdentity | null) => void;
  setSnap: (s: EngineSnapshot) => void;
  setSoundOn: (v: boolean) => void;
  setCrashing: (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  screen: "lobby",
  mode: "replay",
  speed: 2,
  identity: null,
  snap: null,
  soundOn: false,
  crashing: false,
  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setSpeed: (speed) => set({ speed }),
  setIdentity: (identity) => set({ identity }),
  setSnap: (snap) => set({ snap }),
  setSoundOn: (soundOn) => set({ soundOn }),
  setCrashing: (crashing) => set({ crashing }),
}));

const GUEST_KEY = "nerve-guest-id";
const BALANCE_PREFIX = "nerve-balance:";

const ADJECTIVES = [
  "swift",
  "brave",
  "lucky",
  "quiet",
  "fierce",
  "calm",
  "wild",
  "neon",
];
const ANIMALS = [
  "fox",
  "hawk",
  "wolf",
  "otter",
  "lynx",
  "crane",
  "bear",
  "kite",
];

export function shortPubkey(pk: string): string {
  if (pk.length < 8) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export function createGuestIdentity(): PlayerIdentity {
  if (typeof window === "undefined") {
    return { key: "guest-temp", label: "guest-temp", kind: "guest" };
  }
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    id = `guest-${adj}-${animal}`;
    localStorage.setItem(GUEST_KEY, id);
  }
  return { key: id, label: id, kind: "guest" };
}

export function loadBalance(playerKey: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(BALANCE_PREFIX + playerKey);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function saveBalance(playerKey: string, balance: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BALANCE_PREFIX + playerKey, String(balance));
}
