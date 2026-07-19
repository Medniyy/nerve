import { ensureTxLineFeed, getTxLineSnapshot } from "@/sides/txline-feed";

export type FixtureSport = "football" | "tennis";
export type FixtureState = "live" | "upcoming" | "complete";

export interface SportsFixture {
  id: string;
  sport: FixtureSport;
  competition: string;
  participantA: string;
  participantB: string;
  startsAt: number;
  state: FixtureState;
  status: string;
  scoreA: string;
  scoreB: string;
  clock: string;
  /** TxLINE = live scores + odds power this fixture's price and settlement. ESPN = replay/discovery only. */
  provider: "ESPN" | "TxLINE";
  /** Football replay settlement: confirmed scoring-play match minutes. */
  goalMinutes: number[];
  /** Tennis replay/live settlement: set scores and winner flags by set. */
  setsA: Array<{ value: number; winner: boolean }>;
  setsB: Array<{ value: number; winner: boolean }>;
}

const FOOTBALL_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";
const TENNIS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard";
const CACHE_MS = 30_000;

let cache: { at: number; fixtures: SportsFixture[] } | null = null;

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizedState(status: JsonRecord): FixtureState {
  const type = record(status.type);
  const state = text(type.state);
  if (state === "in") return "live";
  if (state === "post" || type.completed === true) return "complete";
  return "upcoming";
}

function stateRank(state: FixtureState): number {
  if (state === "live") return 0;
  if (state === "upcoming") return 1;
  return 2;
}

function competitorName(competitor: JsonRecord): string {
  const team = record(competitor.team);
  const athlete = record(competitor.athlete);
  const roster = record(competitor.roster);
  return (
    text(team.shortDisplayName) ||
    text(team.displayName) ||
    text(athlete.shortName) ||
    text(athlete.displayName) ||
    text(roster.shortDisplayName) ||
    text(roster.displayName) ||
    "TBD"
  );
}

function setLines(competitor: JsonRecord) {
  return list(competitor.linescores).map((item) => {
    const line = record(item);
    return { value: number(line.value), winner: line.winner === true };
  });
}

function parseFootball(payload: unknown): SportsFixture[] {
  const root = record(payload);
  return list(root.events).flatMap((eventValue) => {
    const event = record(eventValue);
    const competition = record(list(event.competitions)[0]);
    const status = record(competition.status);
    const competitors = list(competition.competitors).map(record);
    const home = competitors.find((item) => item.homeAway === "home") ?? competitors[0];
    const away = competitors.find((item) => item.homeAway === "away") ?? competitors[1];
    if (!home || !away) return [];

    const details = list(competition.details).map(record);
    const goalMinutes = details
      .filter((detail) => detail.scoringPlay === true)
      .map((detail) => {
        const clock = record(detail.clock);
        const seconds = number(clock.value, -1);
        if (seconds >= 0) return Math.floor(seconds / 60);
        const display = text(clock.displayValue);
        const match = display.match(/\d+/);
        return match ? Number(match[0]) : -1;
      })
      .filter((minute) => minute >= 0);

    const eventStatus = normalizedState(status);
    const statusType = record(status.type);
    return [
      {
        id: `football:${text(event.id)}`,
        sport: "football" as const,
        competition:
          text(competition.altGameNote) ||
          text(record(event.season).slug) ||
          "Football",
        participantA: competitorName(home),
        participantB: competitorName(away),
        startsAt: Date.parse(text(competition.date) || text(event.date)) || Date.now(),
        state: eventStatus,
        status:
          text(statusType.shortDetail) || text(statusType.description) || "Scheduled",
        scoreA: text(home.score, "0"),
        scoreB: text(away.score, "0"),
        clock: text(status.displayClock) || text(statusType.shortDetail),
        provider: "ESPN" as const,
        goalMinutes,
        setsA: [],
        setsB: [],
      },
    ];
  });
}

function parseTennis(payload: unknown): SportsFixture[] {
  const root = record(payload);
  const fixtures: SportsFixture[] = [];

  for (const eventValue of list(root.events)) {
    const event = record(eventValue);
    const eventName = text(event.name, "ATP Tennis");
    for (const groupingValue of list(event.groupings)) {
      const grouping = record(groupingValue);
      for (const competitionValue of list(grouping.competitions)) {
        const competition = record(competitionValue);
        const type = record(competition.type);
        if (!text(type.slug).includes("singles")) continue;
        const competitors = list(competition.competitors).map(record);
        const first = competitors[0];
        const second = competitors[1];
        if (!first || !second) continue;
        const nameA = competitorName(first);
        const nameB = competitorName(second);
        if (nameA === "TBD" || nameB === "TBD") continue;

        const status = record(competition.status);
        const statusType = record(status.type);
        const setsA = setLines(first);
        const setsB = setLines(second);
        fixtures.push({
          id: `tennis:${text(competition.id)}`,
          sport: "tennis",
          competition: `${eventName} · ${text(record(competition.round).displayName, "Singles")}`,
          participantA: nameA,
          participantB: nameB,
          startsAt: Date.parse(text(competition.date)) || Date.now(),
          state: normalizedState(status),
          status: text(statusType.shortDetail) || text(statusType.description) || "Scheduled",
          scoreA: setsA.map((set) => set.value).join(" "),
          scoreB: setsB.map((set) => set.value).join(" "),
          clock: text(statusType.shortDetail),
          provider: "ESPN",
          goalMinutes: [],
          setsA,
          setsB,
        });
      }
    }
  }
  return fixtures;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Sports feed returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Overlays the live TxLINE World Cup fixture (real scores + real odds) on top
 * of the ESPN discovery list, so the flagship market always prices and
 * settles off TxLINE — ESPN only supplies fixture discovery + completed
 * replays for games TxLINE isn't currently streaming.
 */
async function withTxLineOverlay(base: SportsFixture[]): Promise<SportsFixture[]> {
  const txFixture = await ensureTxLineFeed().catch(() => null);
  if (!txFixture) return base;

  const snap = getTxLineSnapshot();
  const id = `txline:${txFixture.id}`;
  const isUpcoming = txFixture.startTime > 0 && txFixture.startTime > Date.now();
  const overlay: SportsFixture = {
    id,
    sport: "football",
    competition: txFixture.competition || "World Cup",
    participantA: txFixture.home || "Home",
    participantB: txFixture.away || "Away",
    startsAt: txFixture.startTime || Date.now(),
    state: isUpcoming ? "upcoming" : "live",
    status: snap.minute != null ? `${snap.minute}'` : "Live",
    scoreA: String(snap.homeScore),
    scoreB: String(snap.awayScore),
    clock: snap.minute != null ? `${snap.minute}'` : "",
    provider: "TxLINE",
    goalMinutes: [],
    setsA: [],
    setsB: [],
  };
  return [overlay, ...base.filter((fixture) => fixture.id !== id)];
}

export async function getSportsFixtures(force = false): Promise<SportsFixture[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return withTxLineOverlay(cache.fixtures);
  }

  const [football, tennis] = await Promise.allSettled([
    getJson(FOOTBALL_URL),
    getJson(TENNIS_URL),
  ]);
  const fixtures = [
    ...(football.status === "fulfilled" ? parseFootball(football.value) : []),
    ...(tennis.status === "fulfilled" ? parseTennis(tennis.value) : []),
  ]
    .sort(
      (a, b) =>
        stateRank(a.state) - stateRank(b.state) ||
        (a.state === "complete" ? b.startsAt - a.startsAt : a.startsAt - b.startsAt)
    )
    .filter((fixture, index, all) => all.findIndex((item) => item.id === fixture.id) === index);

  if (fixtures.length === 0 && cache?.fixtures.length) return withTxLineOverlay(cache.fixtures);
  if (fixtures.length === 0) {
    const overlaid = await withTxLineOverlay([]);
    if (overlaid.length === 0) throw new Error("No sports fixtures are available");
    return overlaid;
  }
  cache = { at: Date.now(), fixtures };
  return withTxLineOverlay(fixtures);
}
