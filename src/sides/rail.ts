import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";

/**
 * SIDES devnet USDC rail (optional).
 * When SIDES_TREASURY_KEYPAIR (path to a JSON secret key, gitignored under /keys)
 * and SIDES_USDC_MINT are configured, starter grants become REAL devnet
 * test-USDC transfers to the player's wallet, so tokens show up in Phantom.
 * Without config, SIDES runs on the paper ledger only — same rules, zero setup.
 *
 * Migration note: this whole module is env-scoped. Mainnet = new keys + real
 * USDC mint + the Phase B PDA program instead of a treasury wallet.
 */

const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Circle devnet mint

export interface Rail {
  treasury: Keypair;
  mint: PublicKey;
  connection: Connection;
}

let cached: Rail | null | undefined;

export function getRail(): Rail | null {
  if (cached !== undefined) return cached;
  const path = process.env.SIDES_TREASURY_KEYPAIR;
  if (!path) return (cached = null);
  try {
    const secret = Uint8Array.from(
      JSON.parse(readFileSync(path, "utf8")) as number[]
    );
    cached = {
      treasury: Keypair.fromSecretKey(secret),
      mint: new PublicKey(process.env.SIDES_USDC_MINT ?? DEVNET_USDC),
      connection: new Connection(
        process.env.SIDES_RPC_URL ?? "https://api.devnet.solana.com",
        "confirmed"
      ),
    };
  } catch (err) {
    console.error("[sides] rail disabled — bad treasury keypair", err);
    cached = null;
  }
  return cached;
}

/** Send `micro` test-USDC from the treasury to `recipient` (creates their ATA). */
export async function sendGrant(
  recipientWallet: string,
  micro: bigint
): Promise<string | null> {
  const rail = getRail();
  if (!rail) return null;
  const recipient = new PublicKey(recipientWallet);
  const from = getAssociatedTokenAddressSync(rail.mint, rail.treasury.publicKey);
  const to = getAssociatedTokenAddressSync(rail.mint, recipient);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      rail.treasury.publicKey,
      to,
      recipient,
      rail.mint
    ),
    createTransferInstruction(from, to, rail.treasury.publicKey, micro)
  );
  const sig = await sendAndConfirmTransaction(rail.connection, tx, [rail.treasury], {
    commitment: "confirmed",
  });
  return sig;
}
