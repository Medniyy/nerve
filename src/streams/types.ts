import type { PossessionIntensity } from "@/game/config";

export interface OddsSnapshot {
  /** Estimated probability of a goal in the next ~5 min, 0..1 */
  pGoalSoon: number;
  /** Rate of change of pGoalSoon, per minute */
  drift: number;
  raw: unknown;
}

export type MatchEventType =
  | "clock"
  | "odds"
  | "goal"
  | "shot"
  | "corner"
  | "card"
  | "kickoff"
  | "halftime"
  | "fulltime"
  | "possession"
  | "raw";

export interface MatchEvent {
  /** ms, normalized to stream-local time (offset from first event) */
  ts: number;
  type: MatchEventType;
  matchMinute?: number;
  team?: "home" | "away";
  odds?: OddsSnapshot;
  /** Original TxLINE (or synthetic) payload — always preserved */
  raw?: unknown;
  /** Optional human labels for UI */
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  /** Team currently in possession (TxLINE `possession` participant) */
  possessionTeam?: "home" | "away" | null;
  /** Safe → Attack → Danger → HighDanger */
  possessionIntensity?: PossessionIntensity | null;
  /** Server / feed timestamp when available (prefer over client clock) */
  serverTs?: number;
}

export interface MatchStream {
  subscribe(handler: (event: MatchEvent) => void): () => void;
  start(): void;
  stop(): void;
}

/** One line in a JSONL recording */
export interface RecordingLine {
  ts: number;
  source?: "odds" | "scores" | "synthetic";
  payload: unknown;
}
