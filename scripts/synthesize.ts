/**
 * Synthesize a realistic 90-minute match JSONL for demo / offline development.
 * Includes possession team + intensity arcs for the NERVE hold game.
 * Usage: npx tsx scripts/synthesize.ts [outPath]
 */

import fs from "node:fs";
import path from "node:path";

const HOME = "Brazil";
const AWAY = "Argentina";

type Intensity = "Safe" | "Attack" | "Danger" | "HighDanger";

interface Line {
  ts: number;
  source: "synthetic" | "odds";
  payload: Record<string, unknown>;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic PRNG so demos are stable across regenerations */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MATCH_MS_PER_REAL_MS = 30; // 90 min match → 3 min wall at 1x

function matchMinuteToTs(minute: number, kickoffTs: number): number {
  return kickoffTs + (minute * 60_000) / MATCH_MS_PER_REAL_MS;
}

function intensityFromPressure(pressure: number): Intensity {
  if (pressure >= 1.35) return "HighDanger";
  if (pressure >= 0.95) return "Danger";
  if (pressure >= 0.55) return "Attack";
  return "Safe";
}

function main() {
  const out =
    process.argv[2] ??
    path.join(process.cwd(), "recordings", "demo-match.jsonl");
  const kickoffTs = 1_700_000_000_000;
  const lines: Line[] = [];
  const rand = mulberry32(42);

  const push = (minute: number, payload: Record<string, unknown>) => {
    const ts = matchMinuteToTs(minute, kickoffTs);
    lines.push({
      ts,
      source: "synthetic",
      payload: {
        homeTeam: HOME,
        awayTeam: AWAY,
        matchMinute: Math.floor(minute),
        Ts: ts,
        ...payload,
      },
    });
  };

  push(0, { _type: "kickoff", homeScore: 0, awayScore: 0, action: "kickoff" });

  let p = 0.045;
  let homeScore = 0;
  let awayScore = 0;
  let possessionTeam: "home" | "away" = "home";
  let possessionIntensity: Intensity = "Safe";

  const goals: { minute: number; team: "home" | "away"; telegraph: boolean }[] =
    [
      { minute: 23, team: "home", telegraph: true },
      { minute: 51, team: "away", telegraph: false },
      { minute: 78, team: "home", telegraph: true },
    ];

  const pressurePhases: {
    start: number;
    end: number;
    intensity: number;
    team: "home" | "away";
  }[] = [
    { start: 11, end: 16, intensity: 0.7, team: "home" },
    { start: 18, end: 23.2, intensity: 1.4, team: "home" },
    { start: 34, end: 38, intensity: 0.6, team: "away" },
    { start: 48, end: 51.1, intensity: 0.35, team: "away" },
    { start: 62, end: 68, intensity: 0.9, team: "home" },
    { start: 72, end: 78.2, intensity: 1.5, team: "home" },
    { start: 84, end: 88, intensity: 0.5, team: "away" },
  ];

  // Opening possession
  push(0.1, {
    _type: "possession",
    possessionTeam: "home",
    possessionIntensity: "Safe",
    possession: 1,
    possessionType: { SafePossession: {} },
    participant1IsHome: true,
    homeScore,
    awayScore,
  });

  for (let m = 0.5; m <= 90; m += 0.5) {
    if (Math.abs(m - 45) < 0.01) {
      push(45, { _type: "halftime", action: "halftime", homeScore, awayScore });
      p = 0.04;
      continue;
    }
    if (Math.abs(m - 45.5) < 0.01) {
      push(45.5, { _type: "kickoff", action: "kickoff", homeScore, awayScore });
      possessionTeam = "away";
      possessionIntensity = "Safe";
      push(45.55, {
        _type: "possession",
        possessionTeam,
        possessionIntensity,
        possession: 2,
        possessionType: { SafePossession: {} },
        participant1IsHome: true,
        homeScore,
        awayScore,
      });
    }

    const phase = pressurePhases.find((ph) => m >= ph.start && m <= ph.end);
    const goalSoon = goals.find(
      (g) => g.telegraph && m >= g.minute - 5 && m < g.minute
    );

    let target = 0.04 + Math.sin(m / 7) * 0.015;
    if (phase) target = 0.05 + phase.intensity * 0.12;
    if (goalSoon) {
      const t = 1 - (goalSoon.minute - m) / 5;
      target = 0.08 + t * t * 0.22;
    }
    p = clamp(p + (target - p) * 0.35, 0.02, 0.45);

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

    // Possession arc
    let nextTeam: "home" | "away" = possessionTeam;
    let pressure = 0.25 + Math.abs(Math.sin(m / 9)) * 0.35;
    if (phase) {
      nextTeam = phase.team;
      pressure = phase.intensity;
    } else if (rand() < 0.08) {
      nextTeam = possessionTeam === "home" ? "away" : "home";
    }
    if (goalSoon) {
      nextTeam = goalSoon.team;
      pressure = 1.2 + (1 - (goalSoon.minute - m) / 5) * 0.5;
    }

    const nextIntensity = intensityFromPressure(pressure);
    const changed =
      nextTeam !== possessionTeam || nextIntensity !== possessionIntensity;
    // Emit possession every ~1 match minute, or on change
    if (changed || m % 1 < 0.01) {
      possessionTeam = nextTeam;
      possessionIntensity = nextIntensity;
      const typeKey = `${possessionIntensity}Possession`;
      push(m + 0.02, {
        _type: "possession",
        possessionTeam,
        possessionIntensity,
        possession: possessionTeam === "home" ? 1 : 2,
        possessionType: { [typeKey]: {} },
        participant1IsHome: true,
        homeScore,
        awayScore,
      });
      // Confirm turnovers with a second update ~1.2s wall later (~0.6 match min)
      if (changed) {
        push(m + 0.6, {
          _type: "possession",
          possessionTeam,
          possessionIntensity,
          possession: possessionTeam === "home" ? 1 : 2,
          possessionType: { [typeKey]: {} },
          participant1IsHome: true,
          homeScore,
          awayScore,
        });
      }
    }

    if (m % 2 < 0.01) {
      push(m, {
        _type: "clock",
        action: "clock",
        homeScore,
        awayScore,
      });
    }

    if (phase && rand() < 0.35 * phase.intensity) {
      const roll = rand();
      if (roll < 0.45) {
        push(m + 0.05, {
          _type: "shot",
          action: "shot",
          team: phase.team,
          homeScore,
          awayScore,
        });
      } else if (roll < 0.8) {
        push(m + 0.05, {
          _type: "corner",
          action: "corner",
          team: phase.team,
          homeScore,
          awayScore,
        });
      } else {
        push(m + 0.05, {
          _type: "card",
          action: "yellow_card",
          team: rand() < 0.5 ? "home" : "away",
          homeScore,
          awayScore,
        });
      }
    }

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
        p = 0.03;
        // Kickoff restart possession for conceding side
        possessionTeam = g.team === "home" ? "away" : "home";
        possessionIntensity = "Safe";
        push(m + 0.3, {
          _type: "possession",
          possessionTeam,
          possessionIntensity,
          possession: possessionTeam === "home" ? 1 : 2,
          possessionType: { SafePossession: {} },
          participant1IsHome: true,
          homeScore,
          awayScore,
        });
        push(m + 0.8, {
          _type: "possession",
          possessionTeam,
          possessionIntensity,
          possession: possessionTeam === "home" ? 1 : 2,
          possessionType: { SafePossession: {} },
          participant1IsHome: true,
          homeScore,
          awayScore,
        });
      }
    }
  }

  push(90, {
    _type: "fulltime",
    action: "fulltime",
    homeScore,
    awayScore,
  });

  lines.sort((a, b) => a.ts - b.ts);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  fs.writeFileSync(out, body, "utf8");

  const pub = path.join(process.cwd(), "public", "recordings", path.basename(out));
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.writeFileSync(pub, body, "utf8");

  console.log(
    `Wrote ${lines.length} events → ${out} (and ${pub}) (goals at 23', 51', 78'; duration wall@1x ≈ ${((lines[lines.length - 1].ts - lines[0].ts) / 1000).toFixed(0)}s)`
  );
}

main();
