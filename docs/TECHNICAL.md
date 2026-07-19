# Technical notes — NERVE

## Core idea

NERVE is a **possession-based hold game** played alongside a real (or replayed) football match.

TxLINE tells the app which team has the ball and how hot the attack is (`Safe` → `Attack` → `Danger` → `HighDanger`). The player presses **HOLD** to accumulate **Current Hold**, and **releases** to lock points into **Total Score**. A confirmed possession turnover wipes only Current Hold. Goals auto-lock the hold — they never punish the player.

Scoring rates (configurable in `src/game/config.ts`):

| Intensity | Points / second |
| --- | --- |
| Safe | 1 |
| Attack | 2 |
| Danger | 4 |
| HighDanger | 8 |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│ TxLINE Feed  │────▶│              │     │ PossessionEngine   │
│ (live SSE)   │     │  MatchStream │────▶│ (solo, client)     │────▶ UI
├─────────────┤     │  normalize   │     └────────────────────┘
│ JSONL Replay │────▶│              │              │
│ (demo)       │     └──────────────┘              │
└─────────────┘              │                     ▼
                             │              personal best (localStorage)
                             ▼
                    ┌────────────────────┐
                    │ Room session       │  HOLD_START / HOLD_RELEASE
                    │ (server authority) │────▶ shared leaderboard
                    └────────────────────┘
```

`LiveStream` and `ReplayStream` both implement `MatchStream` and emit normalized `MatchEvent`s. The scoring engine does not care which source is attached.

### Solo vs rooms

| Mode | Who owns scoring | Match feed |
| --- | --- | --- |
| Solo | Client `PossessionEngine` | Browser attaches live or replay stream |
| Room (≤5) | Server `room/session.ts` fans events into per-player engines | Server loads replay JSONL or live stream once |

Clients in a room never trust their own score math — they only send hold start/release.

**MVP limitation:** room state is an in-memory `Map` on the Node process (`globalThis`). Fine for one Railway/Vercel instance and multi-tab demos; not durable across multi-instance scale-out.

## TxLINE endpoints used

Verified against TxLINE Quickstart, World Cup free tier docs, Streaming Data examples, and OpenAPI.

| Endpoint | Transport | Role in NERVE |
| --- | --- | --- |
| `POST {origin}/auth/guest/start` | HTTPS JSON | Guest JWT |
| `GET {origin}/api/scores/stream?fixtureId=` | SSE | **Primary:** `possession`, `possessionType` (Safe/Attack/Danger/HighDanger), goals, shots, corners, cards, clock, HT/FT |
| `GET {origin}/api/odds/stream?fixtureId=` | SSE | StablePrice odds (secondary / tooling) |
| `GET {origin}/api/fixtures/snapshot` | HTTPS JSON | Live fixture discovery for the lobby |
| `GET {origin}/api/scores/historical/{fixtureId}` | HTTPS JSON | Optional recorder / research path |

**Auth on upstream data requests:** `Authorization: Bearer ${jwt}` + `X-Api-Token: ${apiToken}`.

**Origins:** mainnet `https://txline.txodds.com`, devnet `https://txline-dev.txodds.com`.

Browser clients only call **same-origin** proxies:

- `/api/txline/scores-stream`
- `/api/txline/odds-stream`
- `/api/live-status`

API tokens and JWTs are read from server env and **never** shipped to the client bundle.

## Possession normalization

`src/streams/normalize.ts` maps TxLINE shapes into:

- `possessionTeam`: `"home" | "away" | null`
- `possessionIntensity`: `"Safe" | "Attack" | "Danger" | "HighDanger" | null`

`possessionType` is accepted as a string (`AttackPossession`) or object key (`{ AttackPossession: {} }`), matching OpenAPI oneOf encodings.

Turnover confirmation (engine config):

- 2 consecutive updates for the new team, **or**
- new team stable for ~1.5s wall time

Unknown / stale possession → scoring pauses, HOLD disabled, UI shows **SYNCING LIVE POSSESSION**.

## Simulated vs real

| Piece | Real / simulated |
| --- | --- |
| Live match events | **Real** TxLINE SSE when `TXLINE_API_TOKEN` (+ fixture) is configured |
| Bundled `demo-match.jsonl` | **Synthesized**, TxLINE-shaped (includes possession arcs) |
| Solo opponents | **None** — personal best only |
| Room opponents | **Real** browser clients |
| Scores / holds | Virtual points — **not** on-chain |
| Solana wallet | Optional `@solana/wallet-adapter` identity — **no game transactions** |
| TxLINE on Solana | Data product is Solana-anchored by TxODDS; NERVE consumes the API |

## Key source map

| Path | Role |
| --- | --- |
| `src/game/possessionEngine.ts` | Pure possession scoring engine |
| `src/game/config.ts` | Rates, turnover, sessions, sponsor ticker |
| `src/streams/` | types, normalize, live, replay |
| `src/room/store.ts` + `session.ts` | Rooms + server-authoritative holds |
| `src/ui/GameApp.tsx` | Lobby → setup → live game UI |
| `scripts/synthesize.ts` | Regenerates demo JSONL with possession |
| `src/app/api/txline/*` | Credentialed SSE proxies |

## Security notes for operators

- Keep secrets in the host env dashboard (Railway / Vercel). Never commit `.env.local`.
- `.gitignore` already ignores `.env` / `.env.*` except `.env.example` (empty placeholders).
- `NEXT_PUBLIC_*` values are visible in the browser by design — only put non-secrets there (e.g. fixture id).
- Proxies return 503 when live is not configured; the product falls back to replay.
