"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";
import { GameApp } from "@/ui/GameApp";
import { RoomWaitingRoom } from "@/ui/RoomWaitingRoom";

const SolanaProviders = dynamic(
  () => import("@/ui/SolanaProviders").then((m) => m.SolanaProviders),
  { ssr: false }
);

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [started, setStarted] = useState(false);

  return (
    <SolanaProviders>
      {started ? (
        <GameApp roomCode={code} />
      ) : (
        <RoomWaitingRoom code={code} onStart={() => setStarted(true)} />
      )}
    </SolanaProviders>
  );
}
