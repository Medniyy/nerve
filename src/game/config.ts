/** All tunable game constants — never hardcode these inline elsewhere. */

export type PossessionIntensity =
  | "Safe"
  | "Attack"
  | "Danger"
  | "HighDanger";

export const GAME_CONFIG = {
  /** Points earned per second of hold at each intensity */
  POINTS_PER_SECOND: {
    Safe: 1,
    Attack: 2,
    Danger: 4,
    HighDanger: 8,
  } as const satisfies Record<PossessionIntensity, number>,

  /** Engine / server tick interval (ms) */
  TICK_MS: 100,

  /**
   * Turnover confirmation: require this many consecutive updates
   * naming a different team before the hold is lost.
   */
  TURNOVER_CONFIRM_UPDATES: 2,

  /**
   * Or: new possession must remain stable for this long (server ts)
   * before confirming turnover. Whichever fires first.
   */
  TURNOVER_STABLE_MS: 1_500,

  /** No fresh possession signal for this long → syncing / pause scoring */
  POSSESSION_STALE_MS: 8_000,

  /** Brief pause after a goal (auto-locks current hold) */
  GOAL_PAUSE_MS: 2_500,

  /** Session duration presets (ms). null = full match. */
  SESSION_DURATIONS: [
    { id: "5m", label: "5 minutes", ms: 5 * 60_000 },
    { id: "10m", label: "10 minutes", ms: 10 * 60_000 },
    { id: "15m", label: "15 minutes", ms: 15 * 60_000 },
    { id: "20m", label: "20 minutes", ms: 20 * 60_000 },
    { id: "full", label: "Full Match", ms: null },
  ] as const,

  /** Connecting countdown before session starts (ms) */
  CONNECT_COUNTDOWN_MS: 3_000,

  /** Max players in a multiplayer room */
  MAX_PLAYERS: 5,

  /** Join window before a room session auto-starts (ms) — time for people to join */
  ROOM_JOIN_WINDOW_MS: 2 * 60_000,

  /** Replay speeds offered in UI */
  REPLAY_SPEEDS: [1, 2, 5, 10] as const,

  /** Match display defaults for synthesized demo */
  DEMO_HOME: "Brazil",
  DEMO_AWAY: "Argentina",

  /** Sponsor ticker messages (rotate slowly) */
  SPONSOR_MESSAGES: [
    "LIVE MATCH DATA BY TxLINE",
    "POWERED BY SOLANA",
    "HOLD YOUR NERVE",
  ] as const,

  /** Time between sponsor message rotations (ms) */
  SPONSOR_ROTATE_MS: 6_000,

  /* ── Legacy danger-model knobs (odds intensity helper) ── */
  P_REF: 0.08,
  DANGER_MIN: 0.25,
  DANGER_MAX: 4.0,
  DANGER_HALF_LIFE_S: 10,
  EVENT_SPIKE: 10,
  SPIKE_DECAY_S: 15,
  ZONE_CALM: 33,
  ZONE_BUILDING: 66,
  USE_INTENSITY_FALLBACK: true,
  INTENSITY_WINDOW_MS: 5 * 60_000,

  /** Kept for legacy GameEngine / headless scripts only — not used by primary UX */
  STAKE: 100,
  STARTING_BALANCE: 1000,
  BALANCE_FLOOR: 100,
  BASE_GROWTH: 0.01,
  INTERMISSION_MS: 15_000,
  GHOST_COUNT: 0,
  GHOST_NAMES: [] as const,
  GHOST_PERSONALITIES: {
    paperhands: { mean: 1.55, std: 0.12, min: 1.35 },
    balanced: { mean: 2.1, std: 0.35, min: 1.5 },
    diamond: { mean: 3.2, std: 0.7, min: 1.8 },
  },
  GHOST_PANIC_CHANCE: 0,
  GHOST_PANIC_WINDOW_MS: 2000,
} as const;

export type GameConfig = typeof GAME_CONFIG;
export type SessionDurationId = (typeof GAME_CONFIG.SESSION_DURATIONS)[number]["id"];
