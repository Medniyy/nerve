# NERVE

A crash-style nerve game on **real football data**. The multiplier climbs while nobody scores. You HOLD with virtual points and must cash out before a real goal crashes the round. A danger meter — driven by live betting-market odds — warns when the market smells a goal. One screen. One button. Optimal-stopping tension on TxLINE match feeds.

![Crash moment — multiplier freezes on GOAL](./docs/crash-moment.svg)

## How to play

- Press **HOLD** to stake 100 virtual points when a round is open.
- Watch the multiplier climb. The hotter the danger meter, the faster it grows.
- Press **CASH OUT** before a goal — or get caught when the ball hits the net.

## How TxLINE powers the game

Live mode consumes documented TxLINE Server-Sent Event streams (not WebSockets):

| Endpoint | Role |
| --- | --- |
| `POST /auth/guest/start` | Guest JWT for API calls |
| `GET /api/scores/stream?fixtureId=` | Goals, shots, corners, cards, kickoff / HT / FT |
| `GET /api/odds/stream?fixtureId=` | StablePrice odds → danger meter (`pGoalSoon`) |
| `GET /api/scores/historical/{fixtureId}` | Optional historical backfill (recorder / research) |

Credentials stay on the server. The browser connects to same-origin proxies at `/api/txline/*-stream`. When no live token is configured, **replay mode** (bundled `recordings/demo-match.jsonl`) is the default demo path — judges can play in under 10 seconds with zero setup.

See [`docs/TECHNICAL.md`](./docs/TECHNICAL.md) for architecture and danger-model details.

## Virtual points disclaimer

**Free to play. Virtual points only. No wagering, no purchases, no payouts.** The Solana wallet is sign-in identity for the leaderboard — no on-chain transactions, no tokens, no NFTs.

## Local development

```bash
npm install
npm run synthesize          # writes recordings/demo-match.jsonl
cp recordings/demo-match.jsonl public/recordings/
npm run test
npm run dev                 # http://localhost:3000
```

Useful scripts:

```bash
npm run replay:console      # log ReplayStream at 10x
npm run headless            # engine + synthesized match end-to-end
npm run record -- <matchId> # append live TxLINE SSE → recordings/<matchId>.jsonl
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TXLINE_API_TOKEN` | For live mode | Activated API token from `POST /api/token/activate` (World Cup free tier ok) |
| `TXLINE_API_ORIGIN` | No | Default `https://txline.txodds.com` (use `https://txline-dev.txodds.com` for devnet) |
| `TXLINE_JWT` | No | Guest JWT; refreshed via `/auth/guest/start` if omitted |
| `TXLINE_FIXTURE_ID` | Recommended for live | Fixture filter for odds/scores streams |
| `NEXT_PUBLIC_TXLINE_FIXTURE_ID` | Optional | Same fixture id exposed to the client for the live button |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | No | Vercel KV / Upstash — leaderboard; falls back to `localStorage` |

Copy `.env.example` → `.env.local`.

## Deploy (Vercel)

1. Push this repo and import in Vercel.
2. Set env vars above (live optional — replay works without them).
3. Deploy. Open the URL → **Play as guest** → **Play a replay**.

## Future

- Real-time multiplayer rounds (shared crash clock across wallets)
- Sponsored matches / branded danger themes
- Premium cosmetic rounds (still virtual points)
- Licensed real-stakes version as a **separate, regulated** product — never inside this build
