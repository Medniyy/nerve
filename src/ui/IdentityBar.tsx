"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect } from "react";
import {
  createGuestIdentity,
  shortPubkey,
  useGameStore,
} from "@/store/gameStore";

/**
 * Identity via official Solana wallet-adapter UI (WalletMultiButton).
 * A guest identity is auto-created on first load (see GameApp), so the
 * wallet is purely optional — it upgrades the leaderboard name.
 */
export function IdentityBar() {
  const { publicKey, connected } = useWallet();
  const identity = useGameStore((s) => s.identity);
  const setIdentity = useGameStore((s) => s.setIdentity);

  useEffect(() => {
    if (connected && publicKey) {
      const pk = publicKey.toBase58();
      setIdentity({
        key: pk,
        label: shortPubkey(pk),
        kind: "wallet",
      });
    } else if (identity?.kind === "wallet") {
      // Wallet disconnected → fall back to guest so play never blocks
      setIdentity(createGuestIdentity());
    }
  }, [connected, publicKey, identity?.kind, setIdentity]);

  return (
    <div className="identity-bar flex items-center gap-2">
      {identity?.kind === "guest" && (
        <span className="guest-identity max-w-[9rem] truncate rounded-full border border-white/12 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-white/70">
          {identity.label}
        </span>
      )}
      {connected && publicKey && (
        <span className="font-mono text-[11px] text-volt">
          {shortPubkey(publicKey.toBase58())}
        </span>
      )}
      <WalletMultiButton className="nerve-wallet-btn" />
    </div>
  );
}
