import { Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * SIDES key ceremony (devnet).
 * Generates a fresh treasury keypair into /keys (gitignored) and prints the
 * env config + funding instructions. For MAINNET later: run this again on a
 * secure machine, never reuse devnet keys, and move authority to a multisig.
 *
 *   npx tsx scripts/sides-setup.ts
 */
const dir = path.join(process.cwd(), "keys");
const file = path.join(dir, "sides-treasury.json");

if (existsSync(file)) {
  console.log(`Treasury already exists at ${file} — refusing to overwrite.`);
  console.log("Delete it manually if you intend to rotate keys.");
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const kp = Keypair.generate();
writeFileSync(file, JSON.stringify([...kp.secretKey]));

console.log("SIDES devnet treasury created (you control this key).");
console.log(`  Pubkey: ${kp.publicKey.toBase58()}`);
console.log(`  Secret: ${file}  (gitignored — keep it that way)`);
console.log("");
console.log("Fund it:");
console.log("  1. Devnet SOL:  https://faucet.solana.com  (pick Devnet)");
console.log("  2. Test USDC:   https://faucet.circle.com  (Solana Devnet)");
console.log("");
console.log("Then add to .env.local and restart:");
console.log(`  SIDES_TREASURY_KEYPAIR=${file}`);
console.log("  SIDES_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
