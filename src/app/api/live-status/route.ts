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

let cache: { at: number; fixture: LiveFixture | null } | null = null;

async function discoverFixture(origin: string, apiToken: string) {
  if (cache && Date.now() - cache.at < 60_000) return cache.fixture;

  const auth = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
  if (!auth.ok) return null;
  const { token: jwt } = (await auth.json()) as { token?: string };
  if (!jwt) return null;

  // Look from yesterday so an in-play match that kicked off before midnight counts
  const epochDay = Math.floor(Date.now() / 86_400_000) - 1;
  const url = `${origin}/api/fixtures/snapshot?competitionId=${WORLD_CUP_COMPETITION_ID}&startEpochDay=${epochDay}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as FixtureRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const now = Date.now();
  const sorted = [...rows].sort((a, b) => a.StartTime - b.StartTime);
  const pick =
    // in the live window right now
    sorted.find(
      (f) => f.StartTime <= now && now < f.StartTime + LIVE_WINDOW_MS
    ) ??
    // else next upcoming
    sorted.find((f) => f.StartTime > now) ??
    // else most recent
    sorted[sorted.length - 1];

  const fixture: LiveFixture = {
    id: pick.FixtureId,
    home: pick.Participant1IsHome ? pick.Participant1 : pick.Participant2,
    away: pick.Participant1IsHome ? pick.Participant2 : pick.Participant1,
    startTime: pick.StartTime,
    competition: pick.Competition,
  };
  cache = { at: Date.now(), fixture };
  return fixture;
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
    return NextResponse.json({
      liveAvailable: true,
      origin,
      fixture: { id: Number(pinned), home: "", away: "", startTime: 0 },
    });
  }

  let fixture: LiveFixture | null = null;
  try {
    fixture = await discoverFixture(origin, apiToken);
  } catch {
    fixture = null;
  }
  // Token configured but no fixture found → still allow live (unfiltered stream)
  return NextResponse.json({ liveAvailable: true, origin, fixture });
}
