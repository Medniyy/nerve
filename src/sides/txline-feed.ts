import { normalizeOddsPayload, normalizeScoresPayload } from "@/streams/normalize";

/**
 * Server-side singleton TxLINE feed for the live World Cup fixture.
 * Consumes the same documented SSE endpoints as the crash-game engine
 * (GET {origin}/api/odds/stream, GET {origin}/api/scores/stream), but
 * directly from the server process rather than proxied per-browser-tab,
 * so every NERVE round can price and settle off one real, live feed.
 */

const WORLD_CUP_COMPETITION_ID = 72;
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
const ODDS_FRESH_MS = 2 * 60_000;
const REDISCOVER_MS = 6 * 60 * 60 * 1000;

export interface TxLineFixtureInfo {
  id: number;
  home: string;
  away: string;
  startTime: number;
  competition: string;
}

interface FeedState {
  fixture: TxLineFixtureInfo | null;
  pGoalSoon: number | null;
  oddsUpdatedAt: number;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  started: boolean;
  starting: boolean;
  discoveredAt: number;
}

interface FixtureRow {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  StartTime: number;
  Competition: string;
}

const g = globalThis as unknown as { __nerveTxLineFeed?: FeedState };
const state: FeedState =
  g.__nerveTxLineFeed ??
  (g.__nerveTxLineFeed = {
    fixture: null,
    pGoalSoon: null,
    oddsUpdatedAt: 0,
    homeScore: 0,
    awayScore: 0,
    minute: null,
    started: false,
    starting: false,
    discoveredAt: 0,
  });

async function discoverFixture(
  origin: string,
  apiToken: string,
  jwt: string
): Promise<TxLineFixtureInfo | null> {
  const epochDay = Math.floor(Date.now() / 86_400_000) - 1;
  const url = `${origin}/api/fixtures/snapshot?competitionId=${WORLD_CUP_COMPETITION_ID}&startEpochDay=${epochDay}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as FixtureRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const now = Date.now();
  const sorted = [...rows].sort((a, b) => a.StartTime - b.StartTime);
  const pick =
    sorted.find((f) => f.StartTime <= now && now < f.StartTime + LIVE_WINDOW_MS) ??
    sorted.find((f) => f.StartTime > now) ??
    sorted[sorted.length - 1];

  return {
    id: pick.FixtureId,
    home: pick.Participant1IsHome ? pick.Participant1 : pick.Participant2,
    away: pick.Participant1IsHome ? pick.Participant2 : pick.Participant1,
    startTime: pick.StartTime,
    competition: pick.Competition,
  };
}

async function readSse(
  response: Response,
  onMessage: (event: string | undefined, data: string) => void
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.match(/\r?\n\r?\n/);
      while (sep?.index !== undefined) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        let event: string | undefined;
        let data = "";
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += `${line.slice(5).replace(/^ /, "")}\n`;
        }
        data = data.replace(/\n$/, "");
        if (data) onMessage(event, data);
        sep = buffer.match(/\r?\n\r?\n/);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function consumeOdds(
  origin: string,
  apiToken: string,
  jwt: string,
  fixtureId: number
): Promise<void> {
  let backoff = 1000;
  while (state.started && state.fixture?.id === fixtureId) {
    try {
      const url = new URL(`${origin}/api/odds/stream`);
      url.searchParams.set("fixtureId", String(fixtureId));
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) throw new Error(`odds stream ${res.status}`);
      backoff = 1000;
      await readSse(res, (event, data) => {
        if (event === "heartbeat") return;
        try {
          const payload: unknown = JSON.parse(data);
          const ev = normalizeOddsPayload(payload, Date.now(), state.pGoalSoon);
          if (ev.odds) {
            state.pGoalSoon = ev.odds.pGoalSoon;
            state.oddsUpdatedAt = Date.now();
          }
        } catch {
          // malformed frame — skip
        }
      });
    } catch (err) {
      if (!state.started || state.fixture?.id !== fixtureId) return;
      console.warn(`[TxLineFeed] odds reconnect in ${backoff}ms`, err);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(30_000, backoff * 2);
    }
  }
}

async function consumeScores(
  origin: string,
  apiToken: string,
  jwt: string,
  fixtureId: number
): Promise<void> {
  let backoff = 1000;
  while (state.started && state.fixture?.id === fixtureId) {
    try {
      const url = new URL(`${origin}/api/scores/stream`);
      url.searchParams.set("fixtureId", String(fixtureId));
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) throw new Error(`scores stream ${res.status}`);
      backoff = 1000;
      await readSse(res, (event, data) => {
        if (event === "heartbeat") return;
        try {
          const payload: unknown = JSON.parse(data);
          const ev = normalizeScoresPayload(payload, Date.now());
          if (typeof ev.homeScore === "number") state.homeScore = ev.homeScore;
          if (typeof ev.awayScore === "number") state.awayScore = ev.awayScore;
          if (typeof ev.matchMinute === "number") state.minute = ev.matchMinute;
        } catch {
          // malformed frame — skip
        }
      });
    } catch (err) {
      if (!state.started || state.fixture?.id !== fixtureId) return;
      console.warn(`[TxLineFeed] scores reconnect in ${backoff}ms`, err);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(30_000, backoff * 2);
    }
  }
}

/** Discovers (once) and keeps live the current/next World Cup fixture. No-ops without TXLINE_API_TOKEN. */
export async function ensureTxLineFeed(): Promise<TxLineFixtureInfo | null> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) return null;
  if (state.started && state.fixture && Date.now() - state.discoveredAt < REDISCOVER_MS) {
    return state.fixture;
  }
  if (state.starting) return state.fixture;

  state.starting = true;
  try {
    const origin = process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
    let jwt = process.env.TXLINE_JWT;
    if (!jwt) {
      const auth = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
      if (!auth.ok) return null;
      const data = (await auth.json()) as { token?: string };
      jwt = data.token;
    }
    if (!jwt) return null;

    const pinned = process.env.TXLINE_FIXTURE_ID;
    const fixture: TxLineFixtureInfo | null = pinned
      ? { id: Number(pinned), home: "", away: "", startTime: 0, competition: "World Cup" }
      : await discoverFixture(origin, apiToken, jwt);
    if (!fixture) return null;

    state.discoveredAt = Date.now();
    if (!state.started || state.fixture?.id !== fixture.id) {
      state.fixture = fixture;
      state.started = true;
      state.pGoalSoon = null;
      state.oddsUpdatedAt = 0;
      void consumeOdds(origin, apiToken, jwt, fixture.id);
      void consumeScores(origin, apiToken, jwt, fixture.id);
    }
    return state.fixture;
  } finally {
    state.starting = false;
  }
}

export function getTxLineSnapshot() {
  return {
    fixture: state.fixture,
    pGoalSoon: state.pGoalSoon,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    minute: state.minute,
    oddsFresh: state.oddsUpdatedAt > 0 && Date.now() - state.oddsUpdatedAt < ODDS_FRESH_MS,
  };
}
