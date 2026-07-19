"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import {
  createElement,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

// wallet-adapter ships React 19-leaning types; cast for React 18 JSX compatibility
const Conn = ConnectionProvider as ComponentType<{
  endpoint: string;
  children?: ReactNode;
}>;
const Wall = WalletProvider as ComponentType<{
  wallets: unknown[];
  autoConnect?: boolean;
  children?: ReactNode;
}>;
const Modal = WalletModalProvider as ComponentType<{ children?: ReactNode }>;

export function SolanaProviders({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network]
  );

  return createElement(
    Conn,
    { endpoint },
    createElement(Wall, { wallets, autoConnect: true }, createElement(Modal, null, children))
  );
}
