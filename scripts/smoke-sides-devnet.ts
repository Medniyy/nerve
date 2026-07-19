import { ed25519 } from "@noble/curves/ed25519";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { practiceIntentMessage, type PracticeIntent } from "../src/sides/auth-message";
import type { SportsFixture } from "../src/sides/fixtures";

const origin = process.env.SIDES_SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
const rpc = process.env.SIDES_RPC_URL ?? "https://api.devnet.solana.com";
const programId = new PublicKey(
  process.env.NEXT_PUBLIC_SIDES_PROGRAM_ID ??
    "DzhHCeBfB66VCTdeiVCfYM9DuE9pNmsHeFLpUdWEbpFD"
);

async function main() {
const fixturesResponse = await fetch(`${origin}/api/sides/fixtures`);
if (!fixturesResponse.ok) throw new Error("Fixture API is unavailable");
const fixturesBody = (await fixturesResponse.json()) as { fixtures: SportsFixture[] };
const fixture = fixturesBody.fixtures.find((item) => item.state !== "upcoming");
if (!fixture) throw new Error("No live or completed fixture is available");

const player = Keypair.generate();
const intent: PracticeIntent = {
  action: "start",
  player: player.publicKey.toBase58(),
  fixtureId: fixture.id,
  issuedAt: Date.now(),
  nonce: crypto.randomUUID(),
};
const signature = ed25519.sign(
  new TextEncoder().encode(practiceIntentMessage(intent)),
  player.secretKey.slice(0, 32)
);
const started = await fetch(`${origin}/api/sides/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...intent, signature: Buffer.from(signature).toString("base64") }),
});
if (!started.ok) throw new Error(`Room start failed: ${await started.text()}`);

const stateResponse = await fetch(
  `${origin}/api/sides/state?player=${player.publicKey.toBase58()}&fixtureId=${encodeURIComponent(fixture.id)}`
);
if (!stateResponse.ok) throw new Error(`Room state failed: ${await stateResponse.text()}`);
const state = (await stateResponse.json()) as { rounds: Array<{ id: string }> };
const round = state.rounds[0];
if (!round) throw new Error("Room did not create a round");

const prepared = await fetch(`${origin}/api/sides/prepare`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fixtureId: fixture.id, roundId: round.id }),
});
const preparedBody = (await prepared.json()) as {
  error?: string;
  market?: string;
  vault?: string;
  signature?: string | null;
};
if (!prepared.ok || !preparedBody.market || !preparedBody.vault) {
  throw new Error(preparedBody.error ?? "Room preparation failed");
}

const connection = new Connection(rpc, "confirmed");
const [marketInfo, vaultInfo] = await Promise.all([
  connection.getAccountInfo(new PublicKey(preparedBody.market), "confirmed"),
  connection.getAccountInfo(new PublicKey(preparedBody.vault), "confirmed"),
]);
if (!marketInfo?.owner.equals(programId)) throw new Error("Market PDA is not owned by SIDES");
if (!vaultInfo) throw new Error("USDC vault account was not created");

console.log(
  JSON.stringify(
    {
      ok: true,
      fixture: fixture.id,
      round: round.id,
      market: preparedBody.market,
      vault: preparedBody.vault,
      initializeSignature: preparedBody.signature,
    },
    null,
    2
  )
);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
