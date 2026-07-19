import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  DEVNET_USDC_MINT,
  SIDES_PROGRAM_ID,
  deriveMarket,
  derivePosition,
  roomSeed,
  roundNumber,
} from "@/sides/chain-config";
import type { Side } from "@/sides/math";

type SendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: { skipPreflight?: boolean }
) => Promise<string>;

async function discriminator(name: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`global:${name}`)
  );
  return new Uint8Array(digest).slice(0, 8);
}

export async function usdcBalance(
  connection: Connection,
  player: PublicKey
): Promise<number> {
  const account = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, player);
  try {
    const balance = await connection.getTokenAccountBalance(account, "confirmed");
    return Number(balance.value.amount) / 1_000_000;
  } catch {
    return 0;
  }
}

export async function lockUsdcPosition({
  connection,
  player,
  fixtureId,
  roundId,
  side,
  amountMicro,
  sendTransaction,
}: {
  connection: Connection;
  player: PublicKey;
  fixtureId: string;
  roundId: string;
  side: Side;
  amountMicro: bigint;
  sendTransaction: SendTransaction;
}): Promise<{ signature: string; market: string; position: string }> {
  const seed = await roomSeed(fixtureId);
  const [market] = deriveMarket(seed, roundNumber(roundId));
  const [position] = derivePosition(market, player);
  const vault = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, market, true);
  const playerTokens = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, player);

  const transaction = new Transaction();
  if (!(await connection.getAccountInfo(playerTokens, "confirmed"))) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        player,
        playerTokens,
        player,
        DEVNET_USDC_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  const data = Buffer.alloc(17);
  data.set(await discriminator("deposit_position"), 0);
  data.writeUInt8(side === "GOAL" ? 1 : 2, 8);
  data.writeBigUInt64LE(amountMicro, 9);
  transaction.add(
    new TransactionInstruction({
      programId: SIDES_PROGRAM_ID,
      data,
      keys: [
        { pubkey: player, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: playerTokens, isSigner: false, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    })
  );

  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = player;
  transaction.recentBlockhash = latest.blockhash;
  const signature = await sendTransaction(transaction, connection, {
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "confirmed"
  );
  if (confirmation.value.err) throw new Error("The devnet transaction did not confirm");
  return { signature, market: market.toBase58(), position: position.toBase58() };
}

export async function claimUsdcPosition({
  connection,
  player,
  fixtureId,
  roundId,
  sendTransaction,
}: {
  connection: Connection;
  player: PublicKey;
  fixtureId: string;
  roundId: string;
  sendTransaction: SendTransaction;
}): Promise<string> {
  const seed = await roomSeed(fixtureId);
  const [market] = deriveMarket(seed, roundNumber(roundId));
  const [position] = derivePosition(market, player);
  const vault = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, market, true);
  const playerTokens = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, player);
  const data = Buffer.from(await discriminator("claim_position"));
  const instruction = new TransactionInstruction({
    programId: SIDES_PROGRAM_ID,
    data,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: playerTokens, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: player,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "confirmed"
  );
  if (confirmation.value.err) throw new Error("The claim did not confirm on devnet");
  return signature;
}
