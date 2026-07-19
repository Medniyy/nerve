import { pFromOddsPayload } from "@/game/danger";
import type {
  MatchEvent,
  MatchEventType,
  OddsSnapshot,
  RecordingLine,
} from "@/streams/types";

/**
 * Normalize raw TxLINE (or synthetic) payloads into MatchEvent.
 * Field names and endpoints are taken from TxLINE OpenAPI / docs —
 * do not invent alternate shapes here.
 *
 * Scores: https://txline.txodds.com/api/scores/stream
 * Odds:   https://txline.txodds.com/api/odds/stream
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function participantToTeam(
  participant: unknown,
  participant1IsHome?: boolean
): "home" | "away" | undefined {
  // TxLINE: participant 1 / 2; participant1IsHome indicates which is home
  const p = Number(participant);
  if (!Number.isFinite(p)) return undefined;
  const p1Home = participant1IsHome !== false;
  if (p === 1) return p1Home ? "home" : "away";
  if (p === 2) return p1Home ? "away" : "home";
  return undefined;
}

function extractMinute(payload: Record<string, unknown>): number | undefined {
  const dataSoccer = asRecord(payload.dataSoccer) ?? asRecord(payload.DataSoccer);
  if (dataSoccer) {
    const mins = dataSoccer.Minutes ?? dataSoccer.minutes;
    if (typeof mins === "number") return mins;
    const nested = asRecord(dataSoccer.New) ?? asRecord(dataSoccer.new);
    if (nested && typeof nested.Minutes === "number") return nested.Minutes;
  }
  const data = asRecord(payload.data) ?? asRecord(payload.Data);
  if (data && typeof data.Minutes === "number") return data.Minutes;

  // SoccerFixtureClock.seconds → minute
  const clock =
    asRecord(payload.clock) ??
    asRecord(payload.Clock) ??
    asRecord(dataSoccer?.Clock as unknown) ??
    asRecord(dataSoccer?.clock as unknown);
  if (clock && typeof clock.seconds === "number") {
    return Math.floor(clock.seconds / 60);
  }
  return undefined;
}

function extractScores(payload: Record<string, unknown>): {
  home?: number;
  away?: number;
} {
  const scoreSoccer =
    asRecord(payload.scoreSoccer) ?? asRecord(payload.ScoreSoccer);
  if (!scoreSoccer) return {};
  const p1 = asRecord(scoreSoccer.Participant1) ?? asRecord(scoreSoccer.participant1);
  const p2 = asRecord(scoreSoccer.Participant2) ?? asRecord(scoreSoccer.participant2);
  const p1Total = asRecord(p1?.Total) ?? asRecord(p1?.total);
  const p2Total = asRecord(p2?.Total) ?? asRecord(p2?.total);
  const g1 = p1Total?.Goals ?? p1Total?.goals;
  const g2 = p2Total?.Goals ?? p2Total?.goals;
  const p1Home = payload.participant1IsHome !== false;
  if (typeof g1 === "number" && typeof g2 === "number") {
    return p1Home
      ? { home: g1, away: g2 }
      : { home: g2, away: g1 };
  }
  return {};
}

function mapAction(action: string): MatchEventType | null {
  const a = action.toLowerCase().replace(/[\s-]/g, "_");
  if (a === "goal" || a === "owngoal" || a === "own_goal" || a === "penalty_goal")
    return "goal";
  if (a === "shot" || a === "shot_on_target" || a === "shot_off_target")
    return "shot";
  if (a === "corner" || a === "corner_kick") return "corner";
  if (
    a === "yellow_card" ||
    a === "red_card" ||
    a === "card" ||
    a === "second_yellow_card"
  )
    return "card";
  if (a === "kickoff" || a === "kick_off" || a === "start") return "kickoff";
  if (a === "halftime" || a === "half_time" || a === "ht") return "halftime";
  if (
    a === "fulltime" ||
    a === "full_time" ||
    a === "ft" ||
    a === "ended" ||
    a === "finish"
  )
    return "fulltime";
  if (a === "clock" || a === "time") return "clock";
  return null;
}

function mapGameState(state: string): MatchEventType | null {
  const s = state.toUpperCase();
  // SoccerFixtureStatus encodings from docs
  if (s === "H1" || s === "H2" || s === "ET1" || s === "ET2") return "clock";
  if (s === "HT" || s === "HTET") return "halftime";
  if (s === "F" || s === "FET" || s === "FPE" || s === "END") return "fulltime";
  if (s === "NS") return "kickoff";
  return null;
}

export function normalizeOddsPayload(
  payload: unknown,
  streamLocalTs: number,
  prevP?: number | null
): MatchEvent {
  const p = pFromOddsPayload(payload);
  const pGoalSoon = p ?? 0.05;
  const drift =
    prevP != null ? (pGoalSoon - prevP) * 6 : 0; // rough /min if ~10s cadence
  const odds: OddsSnapshot = {
    pGoalSoon,
    drift,
    raw: payload,
  };
  return {
    ts: streamLocalTs,
    type: "odds",
    odds,
    raw: payload,
  };
}

export function normalizeScoresPayload(
  payload: unknown,
  streamLocalTs: number
): MatchEvent {
  const rec = asRecord(payload) ?? {};
  const action = String(rec.action ?? rec.Action ?? "");
  const gameState = String(rec.gameState ?? rec.GameState ?? "");

  let type: MatchEventType =
    mapAction(action) ?? mapGameState(gameState) ?? "raw";

  // Possible-event flags can hint at danger without a firm action
  const possible =
    asRecord(rec.parti1StateSoccer) ??
    asRecord(rec.parti2StateSoccer);

  const minute = extractMinute(rec);
  const scores = extractScores(rec);
  const team = participantToTeam(
    rec.participant ?? rec.Participant,
    rec.participant1IsHome as boolean | undefined
  );

  // Synthetic payloads may set type directly
  const synthType = rec._type ?? rec.type;
  if (typeof synthType === "string" && mapAction(synthType)) {
    type = mapAction(String(synthType))!;
  } else if (typeof synthType === "string") {
    const allowed: MatchEventType[] = [
      "clock",
      "odds",
      "goal",
      "shot",
      "corner",
      "card",
      "kickoff",
      "halftime",
      "fulltime",
      "raw",
    ];
    if (allowed.includes(synthType as MatchEventType)) {
      type = synthType as MatchEventType;
    }
  }

  void possible;

  return {
    ts: streamLocalTs,
    type,
    matchMinute: minute ?? (typeof rec.matchMinute === "number" ? rec.matchMinute : undefined),
    team: team ?? (rec.team === "home" || rec.team === "away" ? rec.team : undefined),
    homeTeam: typeof rec.homeTeam === "string" ? rec.homeTeam : undefined,
    awayTeam: typeof rec.awayTeam === "string" ? rec.awayTeam : undefined,
    homeScore:
      scores.home ??
      (typeof rec.homeScore === "number" ? rec.homeScore : undefined),
    awayScore:
      scores.away ??
      (typeof rec.awayScore === "number" ? rec.awayScore : undefined),
    odds: rec.odds as OddsSnapshot | undefined,
    raw: payload,
  };
}

export function normalizeRecordingLine(
  line: RecordingLine,
  streamLocalTs: number,
  prevOddsP?: number | null
): MatchEvent {
  const source = line.source;
  const payload = line.payload;

  if (source === "odds") {
    return normalizeOddsPayload(payload, streamLocalTs, prevOddsP);
  }
  if (source === "scores" || source === "synthetic") {
    return normalizeScoresPayload(payload, streamLocalTs);
  }

  // Heuristic: Odds payloads have SuperOddsType / FixtureId capital F
  const rec = asRecord(payload);
  if (rec && ("SuperOddsType" in rec || "PriceNames" in rec || "Prices" in rec)) {
    return normalizeOddsPayload(payload, streamLocalTs, prevOddsP);
  }
  return normalizeScoresPayload(payload, streamLocalTs);
}
