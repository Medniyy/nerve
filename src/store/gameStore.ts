import { create } from "zustand";
import type { PossessionSnapshot } from "@/game/possessionEngine";
import type { SessionDurationId } from "@/game/config";

export type AppScreen = "lobby" | "setup" | "playing" | "results";
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
  sessionDurationId: SessionDurationId;
  identity: PlayerIdentity | null;
  snap: PossessionSnapshot | null;
  soundOn: boolean;
  personalBest: number;
  setScreen: (s: AppScreen) => void;
  setMode: (m: FeedMode) => void;
  setSpeed: (n: number) => void;
  setSessionDurationId: (id: SessionDurationId) => void;
  setIdentity: (id: PlayerIdentity | null) => void;
  setSnap: (s: PossessionSnapshot) => void;
  setSoundOn: (v: boolean) => void;
  setPersonalBest: (n: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  screen: "lobby",
  mode: "replay",
  speed: 2,
  sessionDurationId: "5m",
  identity: null,
  snap: null,
  soundOn: false,
  personalBest: 0,
  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setSpeed: (speed) => set({ speed }),
  setSessionDurationId: (sessionDurationId) => set({ sessionDurationId }),
  setIdentity: (identity) => set({ identity }),
  setSnap: (snap) => set({ snap }),
  setSoundOn: (soundOn) => set({ soundOn }),
  setPersonalBest: (personalBest) => set({ personalBest }),
}));

const GUEST_KEY = "nerve-guest-id";
const PB_KEY = "nerve-personal-best";

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

export function loadPersonalBest(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(PB_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function savePersonalBest(score: number): void {
  if (typeof window === "undefined") return;
  const prev = loadPersonalBest();
  if (score > prev) {
    localStorage.setItem(PB_KEY, String(Math.floor(score)));
  }
}
