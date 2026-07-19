/**
 * Headless checkpoint: replay synthesized match through the engine at 30x.
 * Usage: npx tsx scripts/headless-play.ts
 */
import fs from "node:fs";
import path from "node:path";
import { GameEngine } from "../src/game/engine";
import { parseJsonl, ReplayStream } from "../src/streams/replay";

async function main() {
  const file = path.join(process.cwd(), "recordings", "demo-match.jsonl");
  if (!fs.existsSync(file)) {
    console.error("Missing recordings/demo-match.jsonl — run npm run synthesize");
    process.exit(1);
  }
  const lines = parseJsonl(fs.readFileSync(file, "utf8"));
  console.log(`Loaded ${lines.length} events`);

  let crashes = 0;
  let ghostCashes = 0;

  const engine = new GameEngine({
    balance: 1000,
    playerName: "Headless",
    onSnapshot: (s) => {
      if (s.phase === "crashed" && s.lastResult?.reason === "goal") {
        // counted via events below
      }
    },
  });

  const stream = new ReplayStream({
    lines,
    speed: 30,
    onEnded: () => {
      console.log("--- replay ended ---");
      console.log(`crashes=${crashes} ghostCashouts=${ghostCashes}`);
      console.log(`final balance=${engine.getBalance()}`);
      engine.detach();
      process.exit(0);
    },
  });

  let lastPhase = "";
  engine.attach(stream);
  engine.attach = engine.attach.bind(engine);
  const unsub = stream.subscribe((ev) => {
    if (ev.type === "kickoff") {
      // auto-hold each round for demo log
      setTimeout(() => engine.hold(), 20);
    }
    if (ev.type === "goal") {
      crashes += 1;
      console.log(
        `CRASH @ ${ev.matchMinute}' ${ev.team} mult≈${engine.getSnapshot().multiplier.toFixed(2)}x`
      );
    }
  });
  void unsub;

  // Poll for ghost cashouts
  const iv = setInterval(() => {
    const s = engine.getSnapshot();
    if (s.phase !== lastPhase) {
      console.log(`phase → ${s.phase} mult=${s.multiplier.toFixed(2)} danger=${s.dangerLevel.toFixed(0)}`);
      lastPhase = s.phase;
    }
    ghostCashes = Math.max(
      ghostCashes,
      s.ghosts.filter((g) => g.cashedOut).length
    );
  }, 200);

  engine.start();
  // Safety timeout
  setTimeout(() => {
    clearInterval(iv);
    console.error("timeout");
    process.exit(1);
  }, 120_000);
}

main();
