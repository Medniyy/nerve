/**
 * Checkpoint: console-log ReplayStream at 10x.
 * Usage: npx tsx scripts/replay-console.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseJsonl, ReplayStream } from "../src/streams/replay";

async function main() {
  const file = path.join(process.cwd(), "recordings", "demo-match.jsonl");
  const lines = parseJsonl(fs.readFileSync(file, "utf8"));
  let n = 0;
  const stream = new ReplayStream({
    lines,
    speed: 10,
    onEnded: () => {
      console.log(`done — ${n} events`);
      process.exit(0);
    },
  });
  stream.subscribe((ev) => {
    n += 1;
    if (
      ev.type === "goal" ||
      ev.type === "kickoff" ||
      ev.type === "halftime" ||
      ev.type === "fulltime" ||
      (ev.type === "odds" && n % 20 === 0)
    ) {
      console.log(
        `${ev.ts.toFixed(0)}ms ${ev.type} min=${ev.matchMinute ?? "-"} p=${ev.odds?.pGoalSoon?.toFixed(3) ?? "-"}`
      );
    }
  });
  stream.start();
}

main();
