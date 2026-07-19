"use client";

import dynamic from "next/dynamic";
import { GameApp } from "@/ui/GameApp";

const SolanaProviders = dynamic(
  () => import("@/ui/SolanaProviders").then((m) => m.SolanaProviders),
  { ssr: false }
);

export default function HomePage() {
  return (
    <SolanaProviders>
      <GameApp />
    </SolanaProviders>
  );
}
