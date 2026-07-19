# TxLINE API feedback

> Notes for TxODDS organizers / hackathon judges from building **NERVE** (Fan Experiences track).
> No credentials or private fixture identifiers are included here.

## From the builder

I built most of the integration with coding agents, and the TxLINE documentation gave them all the information needed to understand the API and set everything up correctly.

The setup was straightforward, and the live data has been fast and accurate.

The possession and attack-intensity data are especially important because they directly power NERVE’s core gameplay.

Overall, the integration has been smooth, and I’ve really enjoyed the developer experience so far.

**Endpoints used:** guest authentication, fixtures snapshot, live scores stream, live odds stream, and historical data for replay tooling.

---

## From coding agents (agentic notes)

### What worked well

- **Guest auth (`POST /auth/guest/start`)** is simple and enough to start calling data endpoints with a Bearer JWT.
- **SSE scores + odds streams** are a good fit for a second-screen game — push updates without inventing a WebSocket protocol.
- **Possession + `possessionType`** (Safe / Attack / Danger / High Danger) is an excellent consumer signal. For NERVE it is the *primary* game driver, not a decoration.
- **World Cup free-tier + fixtures snapshot** made “is anything live right now?” discoverable for a lobby live button.
- **Server-side proxy pattern** is easy: keep `X-Api-Token` on the host, expose only same-origin `/api/txline/*-stream` to the browser.

### Friction / DX issues

- **Scores stream on free tier can feel sparse** (heartbeat-heavy periods). We treat missing / stale possession as **SYNCING** and pause scoring rather than inventing ball position.
- **`possessionType` encoding** appears as either a string discriminator or an object oneOf key in practice — normalizers should accept both shapes.
- **Activating an API token** (guest JWT → on-chain subscribe → `/api/token/activate`) is clear in docs but is still several steps for a brand-new builder; a one-command “dev token” path would speed hackathon onboarding.
- **Replay / demo without credentials** is essential for judges. We ship a synthesized JSONL shaped like TxLINE payloads so the product is always playable.

### Docs gaps

- A short **canonical example payload** for soccer possession updates (participant + `possessionType`) in the streaming docs would reduce guesswork.
- Explicit guidance on **clock / stream timestamps** vs client wall time helps games that need turnover confirmation windows.
- Clarity on free-tier **sampling / heartbeat behavior** for scores SSE would help set UX expectations (“syncing” states).

### Wishlist

- Stable, documented **possession change events** with server timestamps optimized for consumer UIs.
- Lightweight **fixture “in play now”** helper so lobbies don’t have to filter snapshot lists manually.
- Optional **signed snapshot / proof deep-links** aimed at fan apps that want to show “this goal is attested” without building full oracle settlement.

### Endpoints exercised in this project

| Endpoint | Used for |
| --- | --- |
| `POST /auth/guest/start` | Guest JWT |
| `GET /api/scores/stream` | Possession, intensity, goals, match events |
| `GET /api/odds/stream` | StablePrice odds (secondary) |
| `GET /api/fixtures/snapshot` | Live / upcoming fixture discovery |
| `GET /api/scores/historical/{fixtureId}` | Optional recording / research path |

Not used in the Fan Experiences MVP (intentionally): on-chain `validate_*` settlement flows — those fit Markets / oracle tracks better than a free-to-play engagement game.
