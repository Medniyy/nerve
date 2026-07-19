import { PublicKey } from "@solana/web3.js";

export const SIDES_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_SIDES_PROGRAM_ID ??
    "DzhHCeBfB66VCTdeiVCfYM9DuE9pNmsHeFLpUdWEbpFD"
);

// Circle's official USDC mint on Solana devnet.
export const DEVNET_USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_DEVNET_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export function roundNumber(roundId: string): bigint {
  const match = roundId.match(/:r(\d+)$/);
  if (!match) throw new Error("Invalid round id");
  return BigInt(match[1]);
}

export async function roomSeed(fixtureId: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(`NERVE_SIDES_ROOM:${fixtureId}`);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function deriveMarket(
  seed: Uint8Array,
  round: bigint
): [PublicKey, number] {
  const roundBytes = Buffer.alloc(8);
  roundBytes.writeBigUInt64LE(round);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(seed), roundBytes],
    SIDES_PROGRAM_ID
  );
}

export function derivePosition(market: PublicKey, player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), player.toBuffer()],
    SIDES_PROGRAM_ID
  );
}

