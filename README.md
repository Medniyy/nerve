<p align="center">
  <img src="./docs/nerve-banner.png" alt="NERVE — Don’t just watch the match" width="100%" />
</p>

# NERVE

**NERVE turns watching live football into a shared adrenaline rush, where every attack feels personal and every second tests your nerve.**

**Live demo:** [nerveit.xyz](https://nerveit.xyz) · [Railway](https://nerve-production-3af4.up.railway.app)

<p align="center">
  <video src="https://ath.camera/nerve/hophop.mp4" poster="https://ath.camera/nerve/poster.jpg" controls playsinline width="800">
    <a href="https://ath.camera/nerve/">
      <img src="https://ath.camera/nerve/poster.jpg" alt="Watch NERVE DEMO" width="800" />
    </a>
  </video>
</p>

<p align="center">
  <strong><a href="https://ath.camera/nerve/">▶ Watch NERVE DEMO</a></strong>
  ·
  <a href="https://ath.camera/nerve/hophop.mp4">Direct MP4</a>
</p>

<details>
<summary><strong>What it is</strong></summary>

<br>

NERVE is a simple social game you play *alongside* a real live football match.

A real team has the ball. While they attack, your points go up. You **hold** to keep earning and **let go** to bank the points — but if the other team steals the ball while you're still holding, you lose what you hadn't banked yet.

No betting, no crypto knowledge, no real-money risk. Just: *how long do you dare to hold?*

You can play **solo** (beat your personal best) or with **friends in a room** — everyone watches the same match, makes their own calls, and races the same leaderboard.

</details>

<details>
<summary><strong>Description</strong></summary>

<br>

NERVE gives regular sports fans the excitement and tension of real-time decisions without complicated odds, crypto knowledge, or real-money risk.

It turns watching a live match into a simple social experience that anyone can enjoy with friends.

The first version is built for football, but the same one-tap mechanic drops onto basketball, tennis, cricket, esports, and any other live sport.

</details>

<details>
<summary><strong>How to play (ELI5)</strong></summary>

<br>

1. ⚽ **A real team has the ball.** The live header shows who — from the real match feed.
2. 🔥 **Attacks get hot.** Intensity climbs **Safe → Attack → Danger → High Danger**. Hotter = more points every second (**+1 → +2 → +4 → +8/s**).
3. 👇 **Press and HOLD** while the team attacks. Points pile into your *Current Hold*.
4. 🔒 **Release to lock.** Releasing banks points into **Total Score** — safe forever.
5. ⚠️ **Don't get caught holding.** A confirmed possession change wipes only Current Hold. Total Score stays.
6. 🥅 **A goal locks in your hold** automatically — you keep it. Goals never punish you.

> The match controls the game. **You** control when to let go.

</details>

<details>
<summary><strong>Modes</strong></summary>

<br>

| 🎯 Solo | 👥 Rooms (up to 5) | 📡 Live | ▶️ Demo |
| --- | --- | --- | --- |
| Real scoring engine + personal best (local). No fake opponents. | Share a code or QR — friends join the same match; each holds independently. | Real World Cup data from TxLINE when credentials are configured. | Instant replay match — zero setup, no wallet. |
| Session lengths: 5 / 10 / 15 / 20 min or Full Match. | Shared possession, shared session clock, live leaderboard. | Live button appears when a covered fixture is available. | Fastest path for judges and demos. |

Every mode uses the same hold-and-release loop.

</details>

<details>
<summary><strong>Rooms — play with friends</strong></summary>

<br>

Create a room to get a short **code**, a **shareable link**, and a **QR code**. Up to 5 players join the same room and watch the same match.

The host chooses fixture mode (demo or live) and session length, then starts the session. Everyone sees a shared live leaderboard; each player **holds and releases on their own**. Scoring is **server-authoritative** — clients send hold start/release only.

**MVP note:** room state lives in the app server process memory (perfect for multi-tab / single-instance demos). It is not yet a multi-region durable store.

</details>

<details>
<summary><strong>Product</strong></summary>

<br>

NERVE is a free-to-play game that runs alongside a real live match.

Players earn virtual points while a team attacks and decide when to lock them in. The longer they hold, the more they can earn — but if the ball turns over first, they lose the un-banked points.

In football, the tension comes from possession and attacking danger. In other sports it could be a rally, a drive, a power play, or any build-up to a big moment.

Players can join private rooms, compete with friends, and react together to every dangerous attack. NERVE can be embedded into sports media, live-score, streaming, and betting platforms as an interactive engagement widget.

</details>

<details>
<summary><strong>Business model</strong></summary>

<br>

NERVE helps sports platforms turn passive viewers into active participants and keep them engaged throughout live events.

- **Easy to integrate into any sport** — the one-tap hold-and-release loop is sport-agnostic.
- **Increases time on platform** — fans stay for *every* minute, not just the goals.

Monetization (product vision — not in this build):

- White-label widget integrations
- Sponsored matches and tournaments
- In-game advertising / sponsor ticker
- Sponsored rewards and competitions
- Partner offers and onboarding campaigns

NERVE starts with live football and scales into a reusable engagement layer for any sport driven by real-time events.

</details>

<details>
<summary><strong>Hackathon submission</strong></summary>

<br>

Built for the **TxODDS × Solana World Cup Hackathon** ($50K prize pool, three tracks: Markets, Trading Agents, Fan Experiences).

- **Track: Fan Experiences** — consumer-facing engagement game, not a trading or settlement product.
- **Live demo:** [https://nerveit.xyz](https://nerveit.xyz) · [Railway](https://nerve-production-3af4.up.railway.app)
- **Demo video:** [https://ath.camera/nerve/](https://ath.camera/nerve/)
- **TxLINE is the primary data source** — possession + intensity drive scoring. See below and [`docs/TECHNICAL.md`](./docs/TECHNICAL.md).
- **Try it in under 10 seconds:** open the demo → play as guest → **Play Solo**. No wallet, no signup.
- **Solana (honest scope):** TxLINE data is Solana-anchored. Optional Phantom/Solflare connect upgrades display name only — **no on-chain game txs, tokens, or NFTs** in this build.
- API feedback for organizers: [`docs/API-FEEDBACK.md`](./docs/API-FEEDBACK.md).

Not affiliated with FIFA. Uses TxODDS World Cup / international fixture data via TxLINE.

</details>

<details>
<summary><strong>How TxLINE powers the game</strong></summary>

<br>

Live mode consumes documented TxLINE Server-Sent Event streams:

| Endpoint | Role in NERVE |
| --- | --- |
| `POST /auth/guest/start` | Guest JWT for API calls |
| `GET /api/scores/stream?fixtureId=` | **Primary:** possession team + intensity (Safe / Attack / Danger / High Danger), goals, shots, corners, kickoff / HT / FT |
| `GET /api/odds/stream?fixtureId=` | Secondary StablePrice signal (kept for future / fallback tooling) |
| `GET /api/fixtures/snapshot` | Discover live / upcoming fixtures for the live button |

Credentials stay **server-side**. The browser only talks to same-origin proxies (`/api/txline/*-stream`). Never put API tokens in client code or commit `.env.local`.

**Without live credentials**, replay mode (bundled `recordings/demo-match.jsonl`) is the default path — fully playable offline for judges.

</details>

<details>
<summary><strong>Virtual points & Solana disclaimer</strong></summary>

<br>

**Free to play. Virtual points only. No wagering, no purchases, no payouts.**

Optional Solana wallet = identity label on the leaderboard. The game itself does not submit Solana transactions.

</details>

<details>
<summary><strong>Local development</strong></summary>

<br>

```bash
npm install
npm run synthesize          # regenerates recordings/demo-match.jsonl (+ public copy)
npm run test
npm run dev                 # http://localhost:3000
```

Useful scripts:

```bash
npm run replay:console      # log ReplayStream at 10x
npm run headless            # legacy engine harness
npm run record -- <matchId> # append live TxLINE SSE → recordings/<matchId>.jsonl
```

</details>

<details>
<summary><strong>Environment variables</strong></summary>

<br>

Copy `.env.example` → `.env.local`. **Do not commit secrets.** `.env*` is gitignored except `.env.example` (empty placeholders only).

| Variable | Required | Description |
| --- | --- | --- |
| `TXLINE_API_TOKEN` | Live mode only | Activated API token (World Cup free tier ok). Leave empty to use replay-only. |
| `TXLINE_API_ORIGIN` | No | Default `https://txline.txodds.com` |
| `TXLINE_JWT` | No | Guest JWT; app can refresh via `/auth/guest/start` if omitted |
| `TXLINE_FIXTURE_ID` | Recommended for live | Fixture filter for streams |
| `NEXT_PUBLIC_TXLINE_FIXTURE_ID` | Optional | Fixture id for the client live button (public by design — not a secret) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | No | Optional remote leaderboard; falls back to `localStorage` |

</details>

<details>
<summary><strong>Deploy</strong></summary>

<br>

**Railway** (`Dockerfile` + `railway.json` included):

1. Import the repo (or `railway up`).
2. Set env vars in the host dashboard — never in git. Live token optional; replay works without it.
3. Deploy → open URL → guest → **Play Solo**.

**Vercel** works the same way with the same env vars.

For multiplayer rooms on a host, keep **a single running instance** so in-memory room state is shared.

</details>

<details>
<summary><strong>Future</strong></summary>

<br>

- Durable room store (Redis / KV) for multi-instance deploys
- Optional on-chain attestation panel for goals / possession snapshots (TxLINE proofs)
- Sponsored matches / branded themes
- Widget SDK for sports media and platforms
- Expansion beyond football
- Licensed real-stakes product as a **separate, regulated** build — never inside this free app

</details>
