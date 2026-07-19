import type { Side } from "@/sides/math";

export interface PracticeIntent {
  action: "start" | "enter" | "cashout";
  player: string;
  fixtureId: string;
  roundId?: string;
  side?: Side;
  stakeMicro?: string;
  issuedAt: number;
  nonce: string;
}

export function practiceIntentMessage(intent: PracticeIntent): string {
  return [
    "NERVE signed practice",
    "Network: Solana Devnet",
    `Action: ${intent.action}`,
    `Wallet: ${intent.player}`,
    `Fixture: ${intent.fixtureId}`,
    `Round: ${intent.roundId ?? "-"}`,
    `Side: ${intent.side ?? "-"}`,
    `Stake: ${intent.stakeMicro ?? "0"}`,
    `Issued at: ${intent.issuedAt}`,
    `Nonce: ${intent.nonce}`,
    "This signature does not transfer funds.",
  ].join("\n");
}

