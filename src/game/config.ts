/** All tunable game constants — never hardcode these inline elsewhere. */

export const GAME_CONFIG = {
  /** Virtual points staked per round */
  STAKE: 100,
  /** Starting balance for new players */
  STARTING_BALANCE: 1000,
  /** Balance never drops below this so the player can always keep playing */
  BALANCE_FLOOR: 100,

  /** Engine tick interval (ms) */
  TICK_MS: 250,

  /** Reference p(goal soon) for danger=1.0 */
  P_REF: 0.08,
  /** Base multiplier growth per second at danger=1 */
  BASE_GROWTH: 0.01,
  /** Clamp range for danger used in growth */
  DANGER_MIN: 0.25,
  DANGER_MAX: 4.0,

  /** Danger meter EMA half-life (seconds) */
  DANGER_HALF_LIFE_S: 10,
  /** Temporary spike on shot/corner events */
  EVENT_SPIKE: 10,
  /** Spike decay duration (seconds) */
  SPIKE_DECAY_S: 15,

  /** Danger zones (0–100 display) */
  ZONE_CALM: 33,
  ZONE_BUILDING: 66,

  /** Intermission after crash before next round (ms) */
  INTERMISSION_MS: 15_000,

  /** Use event-intensity fallback instead of / in addition to odds */
  USE_INTENSITY_FALLBACK: true,
  /** Rolling window for intensity model (ms) */
  INTENSITY_WINDOW_MS: 5 * 60_000,

  /** Ghosts */
  GHOST_COUNT: 4,
  GHOST_NAMES: [
    "Ghost_Ronaldo",
    "Ghost_Whale",
    "Ghost_Paperhands",
    "Ghost_Diamond",
  ] as const,
  /** Personality cash-out thresholds: mean, stddev */
  GHOST_PERSONALITIES: {
    paperhands: { mean: 1.3, std: 0.15 },
    balanced: { mean: 1.9, std: 0.4 },
    diamond: { mean: 3.0, std: 0.8 },
  },
  /** Chance to panic-cash within 2s when danger enters CRITICAL */
  GHOST_PANIC_CHANCE: 0.3,
  GHOST_PANIC_WINDOW_MS: 2000,

  /** Replay speeds offered in UI */
  REPLAY_SPEEDS: [1, 5, 10, 30] as const,

  /** Match display defaults for synthesized demo */
  DEMO_HOME: "Brazil",
  DEMO_AWAY: "Argentina",
} as const;

export type GameConfig = typeof GAME_CONFIG;
