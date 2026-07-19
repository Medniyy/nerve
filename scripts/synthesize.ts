/**
 * Synthesize a realistic 90-minute match JSONL for demo / offline development.
 * Usage: npx tsx scripts/synthesize.ts [outPath]
 */

import fs from "node:fs";
import path from "node:path";

const HOME = "Brazil";
const AWAY = "Argentina";

interface Line {
  ts: number;
  source: "synthetic" | "odds";
  payload: Record<string, unknown>;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Build match events in wall-clock ms from kickoff, compressed into ~3 min real time at 1x for demo length.
 *  We use 1 real second ≈ 30 match seconds so a full match replays in ~3 minutes at 1x,
 *  and ~18s at 10x. Relative timing between odds spikes and goals is preserved.
 */
const MATCH_MS_PER_REAL_MS = 30; // 90 min match → 3 min wall at 1x

function matchMinuteToTs(minute: number, kickoffTs: number): number {
  return kickoffTs + (minute * 60_000) / MATCH_MS_PER_REAL_MS;
}

function main() {
  const out =
    process.argv[2] ??
    path.join(process.cwd(), "recordings", "demo-match.jsonl");
  const kickoffTs = 1_700_000_000_000; // fixed for determinism
  const lines: Line[] = [];

  const push = (minute: number, payload: Record<string, unknown>) => {
    lines.push({
      ts: matchMinuteToTs(minute, kickoffTs),
      source: "synthetic",
      payload: {
        homeTeam: HOME,
        awayTeam: AWAY,
        matchMinute: Math.floor(minute),
        ...payload,
      },
    });
  };

  // Kickoff
  push(0, { _type: "kickoff", homeScore: 0, awayScore: 0, action: "kickoff" });

  // Baseline calm odds + clock ticks every ~2 match minutes
  let p = 0.045;
  let homeScore = 0;
  let awayScore = 0;

  const goals: { minute: number; team: "home" | "away"; telegraph: boolean }[] =
    [
      { minute: 23, team: "home", telegraph: true }, // market saw it
      { minute: 51, team: "away", telegraph: false }, // cold crash
      { minute: 78, team: "home", telegraph: true }, // market saw it
    ];

  const pressurePhases: { start: number; end: number; intensity: number }[] = [
    { start: 11, end: 16, intensity: 0.7 },
    { start: 18, end: 23.2, intensity: 1.4 }, // builds into goal 1
    { start: 34, end: 38, intensity: 0.6 },
    { start: 48, end: 51.1, intensity: 0.35 }, // weak — goal sneaks through
    { start: 62, end: 68, intensity: 0.9 },
    { start: 72, end: 78.2, intensity: 1.5 }, // builds into goal 3
    { start: 84, end: 88, intensity: 0.5 },
  ];

  for (let m = 0.5; m <= 90; m += 0.5) {
    // Halftime / fulltime markers
    if (Math.abs(m - 45) < 0.01) {
      push(45, { _type: "halftime", action: "halftime", homeScore, awayScore });
      p = 0.04;
      continue;
    }
    if (Math.abs(m - 45.5) < 0.01) {
      push(45.5, { _type: "kickoff", action: "kickoff", homeScore, awayScore });
    }

    const phase = pressurePhases.find((ph) => m >= ph.start && m <= ph.end);
    const goalSoon = goals.find(
      (g) => g.telegraph && m >= g.minute - 5 && m < g.minute
    );

    // Drift pGoalSoon
    let target = 0.04 + Math.sin(m / 7) * 0.015;
    if (phase) target = 0.05 + phase.intensity * 0.12;
    if (goalSoon) {
      const t = 1 - (goalSoon.minute - m) / 5;
      target = 0.08 + t * t * 0.22; // spike before goal
    }
    p = clamp(p + (target - p) * 0.35, 0.02, 0.45);

    // Emit odds snapshot (TxLINE StablePrice-like shape → normalizeOddsPayload)
    const yesPct = (p * 100).toFixed(3);
    const noPct = ((1 - p) * 100).toFixed(3);
    lines.push({
      ts: matchMinuteToTs(m, kickoffTs),
      source: "odds",
      payload: {
        SuperOddsType: "NextGoal",
        PriceNames: ["Yes", "No"],
        Prices: [
          Math.round((1 / Math.max(0.05, p)) * 1000),
          Math.round((1 / Math.max(0.05, 1 - p)) * 1000),
        ],
        Pct: [yesPct, noPct],
        InRunning: true,
        FixtureId: 999001,
        Bookmaker: "StablePrice",
        BookmakerId: 0,
        MessageId: `synth-${m}`,
        Ts: matchMinuteToTs(m, kickoffTs),
      },
    });

    // Clock tick
    if (m % 2 < 0.01) {
      push(m, {
        _type: "clock",
        action: "clock",
        homeScore,
        awayScore,
      });
    }

    // Pressure events
    if (phase && Math.random() < 0.35 * phase.intensity) {
      const roll = Math.random();
      if (roll < 0.45) {
        push(m + 0.05, {
          _type: "shot",
          action: "shot",
          team: Math.random() < 0.55 ? "home" : "away",
          homeScore,
          awayScore,
        });
      } else if (roll < 0.8) {
        push(m + 0.05, {
          _type: "corner",
          action: "corner",
          team: Math.random() < 0.55 ? "home" : "away",
          homeScore,
          awayScore,
        });
      } else {
        push(m + 0.05, {
          _type: "card",
          action: "yellow_card",
          team: Math.random() < 0.5 ? "home" : "away",
          homeScore,
          awayScore,
        });
      }
    }

    // Goals
    for (const g of goals) {
      if (Math.abs(m - g.minute) < 0.01) {
        if (g.team === "home") homeScore += 1;
        else awayScore += 1;
        push(m, {
          _type: "goal",
          action: "goal",
          team: g.team,
          homeScore,
          awayScore,
        });
        p = 0.03; // reset after goal
      }
    }
  }

  push(90, {
    _type: "fulltime",
    action: "fulltime",
    homeScore,
    awayScore,
  });

  // Sort by ts and write
  lines.sort((a, b) => a.ts - b.ts);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  fs.writeFileSync(out, body, "utf8");

  // Also ship under public/ for Next.js static serving
  const pub = path.join(process.cwd(), "public", "recordings", path.basename(out));
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.writeFileSync(pub, body, "utf8");

  console.log(
    `Wrote ${lines.length} events → ${out} (and ${pub}) (goals at 23', 51', 78'; duration wall@1x ≈ ${((lines[lines.length - 1].ts - lines[0].ts) / 1000).toFixed(0)}s)`
  );
}

main();
