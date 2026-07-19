import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FixtureRow {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  StartTime: number;
  Competition: string;
}

export interface LiveFixture {
  id: number;
  home: string;
  away: string;
  startTime: number;
  competition: string;
}

const WORLD_CUP_COMPETITION_ID = 72;
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // treat as live up to 3h after kickoff

let cache:
  | { at: number; fixture: LiveFixture | null; fixtures: LiveFixture[] }
  | null = null;

function toFixture(f: FixtureRow): LiveFixture {
  return {
    id: f.FixtureId,
    home: f.Participant1IsHome ? f.Participant1 : f.Participant2,
    away: f.Participant1IsHome ? f.Participant2 : f.Participant1,
    startTime: f.StartTime,
    competition: f.Competition,
  };
}

async function discoverFixtures(origin: string, apiToken: string) {
  if (cache && Date.now() - cache.at < 60_000) {
    return { fixture: cache.fixture, fixtures: cache.fixtures };
  }

  const auth = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
  if (!auth.ok) return { fixture: null, fixtures: [] };
  const { token: jwt } = (await auth.json()) as { token?: string };
  if (!jwt) return { fixture: null, fixtures: [] };

  // Look from yesterday so an in-play match that kicked off before midnight counts
  const epochDay = Math.floor(Date.now() / 86_400_000) - 1;
  const url = `${origin}/api/fixtures/snapshot?competitionId=${WORLD_CUP_COMPETITION_ID}&startEpochDay=${epochDay}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
  });
  if (!res.ok) return { fixture: null, fixtures: [] };
  const rows = (await res.json()) as FixtureRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { fixture: null, fixtures: [] };
  }

  const now = Date.now();
  const sorted = [...rows].sort((a, b) => a.StartTime - b.StartTime);

  // Keep only matches that are live now or still upcoming (drop finished ones);
  // if nothing qualifies, fall back to the most recent so live mode still works.
  let relevant = sorted.filter(
    (f) => now < f.StartTime + LIVE_WINDOW_MS
  );
  if (relevant.length === 0) relevant = [sorted[sorted.length - 1]];

  const pickRow =
    relevant.find((f) => f.StartTime <= now && now < f.StartTime + LIVE_WINDOW_MS) ??
    relevant.find((f) => f.StartTime > now) ??
    relevant[0];

  const fixtures = relevant.map(toFixture);
  const fixture = toFixture(pickRow);
  cache = { at: Date.now(), fixture, fixtures };
  return { fixture, fixtures };
}

/** Reports whether live TxLINE credentials are present and which fixture to play. */
export async function GET() {
  const apiToken = process.env.TXLINE_API_TOKEN;
  const origin =
    process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
  if (!apiToken) {
    return NextResponse.json({ liveAvailable: false, origin, fixture: null });
  }

  const pinned = process.env.TXLINE_FIXTURE_ID;
  if (pinned) {
    const f = { id: Number(pinned), home: "", away: "", startTime: 0 };
    return NextResponse.json({
      liveAvailable: true,
      origin,
      fixture: f,
      fixtures: [f],
    });
  }

  let fixture: LiveFixture | null = null;
  let fixtures: LiveFixture[] = [];
  try {
    const result = await discoverFixtures(origin, apiToken);
    fixture = result.fixture;
    fixtures = result.fixtures;
  } catch {
    fixture = null;
    fixtures = [];
  }
  // Token configured but no fixture found → still allow live (unfiltered stream)
  return NextResponse.json({ liveAvailable: true, origin, fixture, fixtures });
}
