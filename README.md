<p align="center">
  <img src="./docs/nerve-banner.png" alt="NERVE — Don’t just watch the match" width="100%" />
</p>

# NERVE

**NERVE turns watching live football into a shared adrenaline rush, where every attack feels personal and every second tests your nerve.**

**Live demo:** [nerveit.xyz](https://nerveit.xyz) · [Railway](https://nerve-production-3af4.up.railway.app)

<details>
<summary><strong>What it is</strong></summary>

<br>

NERVE is a simple social game you play *alongside* a real live football match.

A real team has the ball. While they attack, your points go up. You **hold** to keep earning and **let go** to bank the points — but if the other team steals the ball while you're still holding, you lose what you hadn't banked yet.

No betting, no crypto knowledge, no real-money risk. Just: *how long do you dare to hold?*

You can play alone against bots, or with friends — everyone watches the same match, makes their own calls, and races the same leaderboard.

</details>

<details>
<summary><strong>Description</strong></summary>

<br>

NERVE gives regular sports fans the excitement and tension of real-time prediction without complicated odds, crypto knowledge, or real-money risk.

It turns watching a live match into a simple social experience that anyone can enjoy with friends.

The first version is built for football, but the same one-tap mechanic drops onto basketball, tennis, cricket, esports, and any other live sport.

</details>

<details>
<summary><strong>How to play (ELI5)</strong></summary>

<br>

1. ⚽ **A real team has the ball.** The flag and the little ball at the top show you who — live from the real match.
2. 🔥 **Attacks get hot.** The closer a team is to scoring, the hotter it gets: **Safe → Attack → Danger → High Danger**. Hotter = more points every second (**+1 → +2 → +4 → +8/s**).
3. 👇 **Press and HOLD** while the team attacks. Points pile into your *Current Hold*.
4. 🔒 **Let go to keep them.** Releasing banks your points into **Total Score** — safe forever.
5. ⚠️ **Don't get caught holding.** If the ball turns over to the other team while you're still holding, you lose only the points you hadn't banked. Your Total is safe.
6. 🥅 **A goal locks in your hold** automatically — you keep it.

> The match controls the game. **You** control when to let go.

</details>

<details>
<summary><strong>Modes</strong></summary>

<br>

| 🎯 Solo | 👥 Rooms (up to 5) | 📡 Live | ▶️ Demo |
| --- | --- | --- | --- |
| Play alone against AI rivals with their own nerve. | Share a code or QR — friends join the same match, each holds on their own. | Real World Cup data straight from TxLINE. | Instant replay match — zero setup, no wallet. |
| Beat your personal best on a live leaderboard. | A 2-minute join window, then everyone plays in sync. | Pick the match when more than one is on. | The fastest way for a judge to try it. |

Every mode uses the exact same hold-and-release loop and session lengths (5 / 10 / 15 / 20 min or Full Match).

</details>

<details>
<summary><strong>Rooms — play with friends</strong></summary>

<br>

Create a room from the lobby to get a short **code**, a **shareable link**, and a **QR code**. Up to 5 players can join the same room and watch the same match. A **2-minute join window** counts down (the host can start early) so everyone gets in before kickoff.

Everyone sees a shared live leaderboard, but each player **holds and releases on their own** — scoring is server-authoritative so the whole room stays in sync.

</details>

<details>
<summary><strong>Product</strong></summary>

<br>

NERVE is a free-to-play game that runs alongside a real live match.

Players earn virtual points while a team attacks and decide when to lock them in. The longer they hold, the more they can earn — but if the ball turns over first, they lose the un-banked points.

In football, the tension comes from possession and attacking danger. In other sports it could be a rally, a drive, a power play, or any build-up to a big moment.

Players can join private rooms, compete with friends, and react together to every dangerous attack. NERVE can be embedded directly into sports media, live-score, prediction market, streaming, and betting platforms as an interactive widget.

</details>

<details>
<summary><strong>Business model</strong></summary>

<br>

NERVE helps sports platforms turn passive viewers into active participants and keep them engaged throughout live events.

- **Easy to integrate into any sport** — the one-tap hold-and-release loop is sport-agnostic. Point it at football, basketball, tennis, cricket, or esports; only the "moment" changes, not the game.
- **Increases time on platform** — it gives fans a reason to stay for *every* minute, not just the goals, lifting watch time, session length, and return visits.

Monetization:

- White-label widget integrations
- Sponsored matches and tournaments
- Branded balls, objects, and visual elements
- In-game advertising
- Sponsored rewards and competitions
- Custom branded experiences
- Partner offers and onboarding campaigns

NERVE starts with live football and scales into a reusable engagement layer for any sport driven by real-time events.

</details>

<details>
<summary><strong>Hackathon submission</strong></summary>

<br>

Built for the **TxODDS × Solana World Cup Hackathon** ($50K prize pool, three tracks: Markets, Trading Agents, Fan Experiences).

- **Track: Fan Experiences** — NERVE is a consumer-facing engagement game, not a trading product: a free-to-play social layer that turns live match data into hold-and-release tension, solo or with friends.
- **Live demo:** [https://nerveit.xyz](https://nerveit.xyz) · [Railway](https://nerve-production-3af4.up.railway.app)
- **TxLINE is the primary data source**, not a decoration — see **How TxLINE powers the game** below and the endpoint-by-endpoint breakdown in [`docs/TECHNICAL.md`](./docs/TECHNICAL.md).
- **Try it in under 10 seconds, zero setup:** open the live demo (or run locally) → **Play as guest** → **Play Solo**. No wallet, no signup.
- API feedback for TxODDS organizers/judges: [`docs/API-FEEDBACK.md`](./docs/API-FEEDBACK.md).

</details>

<details>
<summary><strong>How TxLINE powers the game</strong></summary>

<br>

The whole game is driven by real match data. Live mode consumes documented TxLINE Server-Sent Event streams (not WebSockets):

| Endpoint | Role |
| --- | --- |
| `POST /auth/guest/start` | Guest JWT for API calls |
| `GET /api/scores/stream?fixtureId=` | Possession team + intensity (Safe / Attack / Danger / High Danger), goals, shots, kickoff / HT / FT |
| `GET /api/odds/stream?fixtureId=` | StablePrice odds → danger model (fallback signal) |
| `GET /api/fixtures/snapshot` | Discover live / upcoming World Cup fixtures for the match picker |

**Possession + intensity is the core signal** — it decides who has the ball and how hot the attack is, second by second. Credentials stay on the server; the browser talks to same-origin proxies at `/api/txline/*-stream`. With no live token, **replay mode** (bundled `recordings/demo-match.jsonl`) is the default demo path — playable in under 10 seconds with zero setup.

See [`docs/TECHNICAL.md`](./docs/TECHNICAL.md) for architecture details.

</details>

<details>
<summary><strong>Virtual points disclaimer</strong></summary>

<br>

**Free to play. Virtual points only. No wagering, no purchases, no payouts.** The Solana wallet is sign-in identity for the leaderboard — no on-chain transactions, no tokens, no NFTs.

</details>

<details>
<summary><strong>Local development</strong></summary>

<br>

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

</details>

<details>
<summary><strong>Environment variables</strong></summary>

<br>

| Variable | Required | Description |
| --- | --- | --- |
| `TXLINE_API_TOKEN` | For live mode | Activated API token from `POST /api/token/activate` (World Cup free tier ok) |
| `TXLINE_API_ORIGIN` | No | Default `https://txline.txodds.com` (use `https://txline-dev.txodds.com` for devnet) |
| `TXLINE_JWT` | No | Guest JWT; refreshed via `/auth/guest/start` if omitted |
| `TXLINE_FIXTURE_ID` | Recommended for live | Fixture filter for odds/scores streams |
| `NEXT_PUBLIC_TXLINE_FIXTURE_ID` | Optional | Same fixture id exposed to the client for the live button |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | No | Vercel KV / Upstash — leaderboard; falls back to `localStorage` |

Copy `.env.example` → `.env.local`.

</details>

<details>
<summary><strong>Deploy</strong></summary>

<br>

**Railway** (this repo ships a `Dockerfile` + `railway.json`):

1. Push this repo and import in Railway (or `railway up` from this directory).
2. Set env vars above (live optional — replay works without them).
3. Deploy. Open the URL → **Play as guest** → **Play Solo**.

**Vercel** works too (no extra config needed):

1. Push this repo and import in Vercel.
2. Set env vars above (live optional — replay works without them).
3. Deploy. Open the URL → **Play as guest** → **Play Solo**.

</details>

<details>
<summary><strong>Future</strong></summary>

<br>

- Tighter room sync (one server-broadcast match clock shared across all players)
- Sponsored matches / branded themes
- Premium cosmetic rounds (still virtual points)
- Widget SDK for sports media, prediction, and betting platforms
- Expansion beyond football — basketball, tennis, cricket, esports
- Licensed real-stakes version as a **separate, regulated** product — never inside this build

</details>
