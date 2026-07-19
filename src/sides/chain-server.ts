import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  DEVNET_RPC,
  DEVNET_USDC_MINT,
  SIDES_PROGRAM_ID,
  deriveMarket,
  derivePosition,
  roundNumber,
} from "@/sides/chain-config";
import type { Side } from "@/sides/math";

const connection = new Connection(process.env.SIDES_RPC_URL ?? DEVNET_RPC, "confirmed");

function hash(name: string): Buffer {
  return createHash("sha256").update(name).digest();
}

function instructionDiscriminator(name: string): Buffer {
  return hash(`global:${name}`).subarray(0, 8);
}

function operator(): Keypair {
  const inline = process.env.SIDES_OPERATOR_KEYPAIR;
  if (inline) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(inline) as number[]));
  const path = process.env.SIDES_OPERATOR_KEYPAIR_PATH ?? join(process.cwd(), "keys", "devnet-operator.json");
  if (!existsSync(path)) throw new Error("Devnet room operator is not configured");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function seedFor(fixtureId: string): Buffer {
  return hash(`NERVE_SIDES_ROOM:${fixtureId}`);
}

export function chainEnabled(): boolean {
  return process.env.SIDES_ESCROW_ENABLED === "true";
}

export async function prepareMarket({
  fixtureId,
  roundId,
  priceBps,
  feeBps,
  commitClosesAt,
  windowEndsAt,
}: {
  fixtureId: string;
  roundId: string;
  priceBps: number;
  feeBps: number;
  commitClosesAt: number;
  windowEndsAt: number;
}) {
  if (!chainEnabled()) throw new Error("Devnet escrow is not enabled");
  const seed = seedFor(fixtureId);
  const round = roundNumber(roundId);
  const [market] = deriveMarket(seed, round);
  const vault = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, market, true);
  if (await connection.getAccountInfo(market, "confirmed")) {
    return { market: market.toBase58(), vault: vault.toBase58(), signature: null };
  }

  const signer = operator();
  const data = Buffer.alloc(8 + 32 + 8 + 2 + 2 + 8 + 8);
  let offset = 0;
  instructionDiscriminator("initialize_market").copy(data, offset);
  offset += 8;
  seed.copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(round, offset);
  offset += 8;
  data.writeUInt16LE(priceBps, offset);
  offset += 2;
  data.writeUInt16LE(feeBps, offset);
  offset += 2;
  data.writeBigInt64LE(BigInt(Math.floor(commitClosesAt / 1000)), offset);
  offset += 8;
  data.writeBigInt64LE(BigInt(Math.floor(windowEndsAt / 1000)), offset);

  const instruction = new TransactionInstruction({
    programId: SIDES_PROGRAM_ID,
    data,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  transaction.sign(signer);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 4,
    });
  } catch (error) {
    if (await connection.getAccountInfo(market, "confirmed")) {
      return { market: market.toBase58(), vault: vault.toBase58(), signature: null };
    }
    throw error;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await connection.getAccountInfo(market, "confirmed")) {
      return { market: market.toBase58(), vault: vault.toBase58(), signature };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`Devnet room submitted but confirmation is delayed: ${signature}`);
}

export async function verifyPosition({
  fixtureId,
  roundId,
  player,
  side,
  stake,
}: {
  fixtureId: string;
  roundId: string;
  player: string;
  side: Side;
  stake: bigint;
}): Promise<boolean> {
  if (!chainEnabled()) return false;
  const owner = new PublicKey(player);
  const [market] = deriveMarket(seedFor(fixtureId), roundNumber(roundId));
  const [position] = derivePosition(market, owner);
  const info = await connection.getAccountInfo(position, "confirmed");
  if (!info || !info.owner.equals(SIDES_PROGRAM_ID) || info.data.length < 91) return false;
  const storedMarket = new PublicKey(info.data.subarray(8, 40));
  const storedOwner = new PublicKey(info.data.subarray(40, 72));
  const storedSide = info.data.readUInt8(72);
  const storedStake = info.data.readBigUInt64LE(73);
  return (
    storedMarket.equals(market) &&
    storedOwner.equals(owner) &&
    storedSide === (side === "GOAL" ? 1 : 2) &&
    storedStake === stake
  );
}

export async function settleMarketOnChain(
  fixtureId: string,
  roundId: string,
  winner: Side | null
): Promise<string | null> {
  if (!chainEnabled()) return null;
  const signer = operator();
  const [market] = deriveMarket(seedFor(fixtureId), roundNumber(roundId));
  const info = await connection.getAccountInfo(market, "confirmed");
  if (!info) return null;

  const data = Buffer.alloc(9);
  instructionDiscriminator("settle_market").copy(data, 0);
  data.writeUInt8(winner === "GOAL" ? 1 : winner === "NO_GOAL" ? 2 : 0, 8);
  const instruction = new TransactionInstruction({
    programId: SIDES_PROGRAM_ID,
    data,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
    ],
  });
  try {
    return await sendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [signer],
      { commitment: "confirmed" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("AlreadyResolved") || message.includes("already been resolved")) return null;
    throw error;
  }
}

export async function verifyClaimed({
  fixtureId,
  roundId,
  player,
}: {
  fixtureId: string;
  roundId: string;
  player: string;
}): Promise<boolean> {
  if (!chainEnabled()) return false;
  const owner = new PublicKey(player);
  const [market] = deriveMarket(seedFor(fixtureId), roundNumber(roundId));
  const [position] = derivePosition(market, owner);
  const info = await connection.getAccountInfo(position, "confirmed");
  return !!info && info.owner.equals(SIDES_PROGRAM_ID) && info.data.length >= 82 && info.data.readUInt8(81) === 1;
}
