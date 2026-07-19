import { createPublicKey, verify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { practiceIntentMessage, type PracticeIntent } from "@/sides/auth-message";
import { prepareMarket, verifyClaimed, verifyPosition } from "@/sides/chain-server";
import { getSportsFixtures } from "@/sides/fixtures";
import { cashOut, enter, historyFor, markClaimed, roundFor, startMarket, stateFor } from "@/sides/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const globalAuth = globalThis as unknown as { __nerveSidesNonces?: Set<string> };
const usedNonces =
  globalAuth.__nerveSidesNonces ?? (globalAuth.__nerveSidesNonces = new Set<string>());

function verifyIntent(intent: PracticeIntent, signatureBase64: string): boolean {
  if (
    !intent.nonce ||
    usedNonces.has(intent.nonce) ||
    Math.abs(Date.now() - intent.issuedAt) > MAX_SIGNATURE_AGE_MS
  ) {
    return false;
  }
  try {
    const publicKey = new PublicKey(intent.player).toBytes();
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]),
      format: "der",
      type: "spki",
    });
    const valid = verify(
      null,
      Buffer.from(practiceIntentMessage(intent)),
      key,
      Buffer.from(signatureBase64, "base64")
    );
    if (valid) usedNonces.add(intent.nonce);
    return valid;
  } catch {
    return false;
  }
}

async function fixtureById(fixtureId: string) {
  const fixtures = await getSportsFixtures();
  return fixtures.find((fixture) => fixture.id === fixtureId) ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { action: string } }
) {
  if (params.action === "history") {
    const player = req.nextUrl.searchParams.get("player") ?? "";
    if (!player) return NextResponse.json({ error: "player required" }, { status: 400 });
    return NextResponse.json({ positions: historyFor(player) });
  }
  if (params.action !== "state") {
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
  const player = req.nextUrl.searchParams.get("player") ?? "";
  const fixtureId = req.nextUrl.searchParams.get("fixtureId") ?? "";
  if (!player || !fixtureId) {
    return NextResponse.json({ error: "player and fixtureId required" }, { status: 400 });
  }
  const fixture = await fixtureById(fixtureId);
  if (!fixture) return NextResponse.json({ error: "Fixture unavailable" }, { status: 404 });
  const state = stateFor(player, fixture);
  if (!state) return NextResponse.json({ error: "Practice not started" }, { status: 409 });
  return NextResponse.json(state);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { action: string } }
) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const player = typeof body.player === "string" ? body.player : "";
  const fixtureId = typeof body.fixtureId === "string" ? body.fixtureId : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const issuedAt = Number(body.issuedAt);
  if (params.action === "prepare") {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    const round = roundFor(fixtureId, roundId);
    if (!fixtureId || !roundId || !round || round.phase !== "open" || Date.now() >= round.commitClosesAt) {
      return NextResponse.json({ error: "This shared room is no longer open" }, { status: 409 });
    }
    try {
      const result = await prepareMarket({
        fixtureId,
        roundId,
        priceBps: Number(round.priceBps),
        feeBps: 100,
        commitClosesAt: round.commitClosesAt,
        windowEndsAt: round.windowEndsAt,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Devnet room could not be prepared" },
        { status: 503 }
      );
    }
  }

  if (params.action === "enter") {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    const side = body.side === "GOAL" || body.side === "NO_GOAL" ? body.side : null;
    const stakeMicro = typeof body.stakeMicro === "string" ? body.stakeMicro : "";
    const txSignature = typeof body.txSignature === "string" ? body.txSignature : "";
    if (!player || !fixtureId || !roundId || !side || !stakeMicro || !txSignature) {
      return NextResponse.json({ error: "A confirmed devnet transaction is required" }, { status: 400 });
    }
    let stake: bigint;
    try {
      stake = BigInt(stakeMicro);
    } catch {
      return NextResponse.json({ error: "Invalid stake" }, { status: 400 });
    }
    try {
      const verified = await verifyPosition({ fixtureId, roundId, player, side, stake });
      if (!verified) {
        return NextResponse.json({ error: "The USDC lock could not be verified on devnet" }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: "Devnet verification is temporarily unavailable" }, { status: 503 });
    }
    const result = enter(player, fixtureId, roundId, side, stake, txSignature);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, commitHash: result.commitHash });
  }

  if (params.action === "claim") {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    const txSignature = typeof body.txSignature === "string" ? body.txSignature : "";
    if (!player || !fixtureId || !roundId || !txSignature) {
      return NextResponse.json({ error: "A confirmed claim transaction is required" }, { status: 400 });
    }
    try {
      if (!(await verifyClaimed({ fixtureId, roundId, player }))) {
        return NextResponse.json({ error: "The claim could not be verified on devnet" }, { status: 409 });
      }
      if (!markClaimed(player, fixtureId, roundId, txSignature)) {
        return NextResponse.json({ error: "Position history was not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Devnet verification is temporarily unavailable" }, { status: 503 });
    }
  }

  if (!player || !fixtureId || !signature || !nonce || !Number.isFinite(issuedAt)) {
    return NextResponse.json({ error: "A wallet signature is required" }, { status: 400 });
  }

  if (params.action === "start") {
    const intent: PracticeIntent = {
      action: "start",
      player,
      fixtureId,
      issuedAt,
      nonce,
    };
    if (!verifyIntent(intent, signature)) {
      return NextResponse.json({ error: "Signature could not be verified" }, { status: 401 });
    }
    const fixture = await fixtureById(fixtureId);
    if (!fixture) return NextResponse.json({ error: "Fixture unavailable" }, { status: 404 });
    const result = startMarket(player, fixture);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (params.action === "cashout") {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    const intent: PracticeIntent = {
      action: "cashout",
      player,
      fixtureId,
      roundId,
      issuedAt,
      nonce,
    };
    if (!verifyIntent(intent, signature)) {
      return NextResponse.json({ error: "Signature could not be verified" }, { status: 401 });
    }
    const result = cashOut(player, fixtureId, roundId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({
      ok: true,
      cashedMicro: result.cashedMicro,
      multiple: result.multiple,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 404 });
}
