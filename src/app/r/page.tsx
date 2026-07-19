"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createGuestIdentity, useGameStore } from "@/store/gameStore";

interface LiveFixture {
  id: number;
  home: string;
  away: string;
  startTime: number;
}

export default function CreateRoomPage() {
  const router = useRouter();
  const identity = useGameStore((s) => s.identity);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveFixture, setLiveFixture] = useState<LiveFixture | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

  useEffect(() => {
    void fetch("/api/live-status")
      .then((r) => r.json())
      .then((d: { liveAvailable?: boolean; fixture?: LiveFixture | null }) => {
        setLiveAvailable(Boolean(d.liveAvailable));
        setLiveFixture(d.fixture ?? null);
      })
      .catch(() => setLiveAvailable(false));
  }, []);

  const createRoom = async (mode: "replay" | "live") => {
    if (!identity || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, hostId: identity.key, hostLabel: identity.label }),
      });
      const data = (await res.json()) as { ok: boolean; room?: { code: string } };
      if (data.ok && data.room) {
        router.push(`/r/${data.room.code}`);
      } else {
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="lobby-shell grain relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <div className="relative z-10 flex w-full max-w-sm flex-col gap-4">
        <p className="rise-in lobby-kicker">Play together</p>
        <h1 className="rise-in font-display text-4xl tracking-wide text-white">Create a room</h1>
        <p className="rise-in text-sm text-white/60">
          Get a code and QR to share. Up to 5 players watch the same match and share a leaderboard —
          everyone still holds and cashes out on their own.
        </p>

        <button
          type="button"
          disabled={!identity || creating}
          onClick={() => void createRoom("replay")}
          className="lobby-play mt-4"
        >
          <span>Create room</span>
          <small>Demo match, instant start →</small>
        </button>

        {liveAvailable && (
          <button
            type="button"
            disabled={!identity || creating}
            onClick={() => void createRoom("live")}
            className="lobby-live"
          >
            <span className="lobby-live-title">
              <i /> {liveFixture?.home ? `${liveFixture.home} v ${liveFixture.away}` : "Live match"}
            </span>
            <span className="lobby-live-sub">Real World Cup data</span>
          </button>
        )}

        <a href="/" className="lobby-help">
          ← Back to solo play
        </a>
      </div>
    </div>
  );
}
