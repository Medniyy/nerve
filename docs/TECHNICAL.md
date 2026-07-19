# Technical notes — Nerve

## Core idea

Nerve is an optimal-stopping game: a multiplier grows continuously on a live (or replayed) football match until a real goal crashes everyone still holding. Danger — estimated probability of a goal soon — is derived primarily from TxLINE StablePrice odds, with an event-intensity fallback so the game never goes dark. Ghost opponents create chicken-game pressure on a single solo screen.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ TxLINE Feed  │────▶│              │     │             │
│ (live)       │     │  MatchStream │────▶│ Game Engine │────▶ UI (React)
├─────────────┤     │  (interface) │     │             │
│ JSONL Replay │────▶│              │     └─────────────┘
│ (recorded)   │     └──────────────┘            │
└─────────────┘                                  ▼
      ▲                                    KV (leaderboard)
      │
┌─────────────┐
│  Recorder    │  (standalone Node script)
└─────────────┘
```

The game engine never knows whether events are live or replayed. Both `LiveStream` and `ReplayStream` implement `MatchStream` and emit normalized `MatchEvent`s.

## TxLINE endpoints used

Verified against [Quickstart](https://txline.txodds.com/documentation/quickstart), [World Cup Free Tier](https://txline.txodds.com/documentation/worldcup), [Streaming Data](https://txline.txodds.com/documentation/examples/streaming-data), and the published OpenAPI (`/docs/docs.yaml`).

| Endpoint | Transport | What we use it for |
| --- | --- | --- |
| `POST {origin}/auth/guest/start` | HTTPS JSON | Guest JWT (`Authorization: Bearer …`) |
| `GET {origin}/api/scores/stream?fixtureId=` | SSE | Match actions (`action`), game state, scoreSoccer, clock → goals / shots / corners / cards / kickoff / HT / FT |
| `GET {origin}/api/odds/stream?fixtureId=` | SSE | StablePrice odds (`SuperOddsType`, `PriceNames`, `Prices`, `Pct`) → `OddsSnapshot.pGoalSoon` |
| `GET {origin}/api/scores/historical/{fixtureId}` | HTTPS JSON | Documented for research / backfill (recorder path); not required for demo replay |

**Auth headers (data requests):** `Authorization: Bearer ${jwt}` + `X-Api-Token: ${apiToken}` from `/api/token/activate` after on-chain `subscribe` (free World Cup tiers 1 / 12 require no TxL purchase, but do need SOL for the subscribe tx).

**Network origins:** mainnet `https://txline.txodds.com`, devnet `https://txline-dev.txodds.com`.

Browser clients talk to **same-origin proxies** `/api/txline/odds-stream` and `/api/txline/scores-stream`, which attach credentials server-side.

## Danger-model derivation

Order of preference (`src/game/danger.ts`):

1. **Next-goal / short-horizon markets** — if `SuperOddsType` looks like NextGoal, take demargined `Pct` for the Yes leg (else implied probability from `Prices` ÷ 1000 as decimal odds, overround-normalized).
2. **Over/under totals** — Over percentage scaled into a short-horizon proxy (shortening Over ⇒ rising `pGoalSoon`).
3. **Event-intensity fallback** (always available via `USE_INTENSITY_FALLBACK`) — rolling 5-minute window of shots / corners / cards with exponential decay.

The meter display is an EMA of `pGoalSoon` (~10s half-life) plus short spikes on shot/corner events. Multiplier growth:

```
danger = clamp(pGoalSoon / P_REF, 0.25, 4.0)   // P_REF = 0.08
growthPerSecond = BASE_GROWTH * danger         // BASE_GROWTH = 0.010
multiplier *= (1 + growthPerSecond * dt)
```

`dt` is **game-time** from the stream, so replay at 10x preserves the same risk curve as live.

## Simulated vs real

| Piece | Real / simulated |
| --- | --- |
| Match events & odds in **live** mode | **Real** TxLINE SSE (when credentials + covered fixture available) |
| Bundled `demo-match.jsonl` | **Synthesized** but shaped like TxLINE odds/scores payloads |
| Ghost players & ticker | **Simulated** personalities |
| Player balances / leaderboard | Local + optional Vercel KV — **not** on-chain |
| Wallet connect | **Real** `@solana/wallet-adapter` (`WalletMultiButton` + Phantom/Solflare) — **identity only**, no custom connectors, no transactions |

## Key source map

- `src/game/` — pure engine (no React)
- `src/streams/` — MatchStream, normalize, live, replay
- `scripts/record.ts` / `scripts/synthesize.ts` — feed tooling
- `src/ui/` — single-screen lobby + in-round + crash overlay
