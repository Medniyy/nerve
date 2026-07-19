"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type SessionDurationId } from "@/game/config";
import { createGuestIdentity, useGameStore } from "@/store/gameStore";
import { DurationPicker } from "@/ui/DurationPicker";

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
  const [fixtures, setFixtures] = useState<LiveFixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [durationId, setDurationId] = useState<SessionDurationId>("5m");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

  useEffect(() => {
    void fetch("/api/live-status")
      .then((r) => r.json())
      .then(
        (d: {
          liveAvailable?: boolean;
          fixture?: LiveFixture | null;
          fixtures?: LiveFixture[];
        }) => {
          setLiveAvailable(Boolean(d.liveAvailable));
          setLiveFixture(d.fixture ?? null);
          setFixtures(d.fixtures ?? (d.fixture ? [d.fixture] : []));
          setSelectedFixtureId(d.fixture?.id ?? null);
        }
      )
      .catch(() => setLiveAvailable(false));
  }, []);

  const selectedFixture =
    fixtures.find((f) => f.id === selectedFixtureId) ?? liveFixture;

  const fmtKick = (f: LiveFixture) => {
    const label = `${f.home} v ${f.away}`;
    if (!f.startTime) return label;
    const kickedOff = f.startTime <= Date.now();
    const t = new Date(f.startTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${label} · ${kickedOff ? "LIVE" : t}`;
  };

  const createRoom = async (mode: "replay" | "live") => {
    if (!identity || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          hostId: identity.key,
          hostLabel: identity.label,
          sessionDurationId: durationId,
          fixtureId:
            mode === "live"
              ? selectedFixtureId ?? liveFixture?.id
              : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        room?: { code: string };
      };
      if (data.ok && data.room) {
        router.push(`/r/${data.room.code}`);
      } else {
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  };

  const joinExisting = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length >= 4) router.push(`/r/${code}`);
  };

  return (
    <div className="lobby-shell grain relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <div className="relative z-10 flex w-full max-w-sm flex-col gap-4">
        <h1 className="rise-in font-display text-4xl tracking-wide text-white">
          Play together
        </h1>
        <p className="rise-in text-sm text-white/60">
          Same match. Same possession. Independent holds. Up to 5 players.
        </p>

        <h2 className="mt-2 text-left font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          Session length
        </h2>
        <DurationPicker value={durationId} onChange={setDurationId} />

        <button
          type="button"
          disabled={!identity || creating}
          onClick={() => void createRoom("replay")}
          className="lobby-play mt-2"
        >
          <span>Create Room</span>
          <small>Demo match →</small>
        </button>

        {liveAvailable && (
          <>
            {fixtures.length > 1 && (
              <select
                aria-label="Choose live match"
                value={selectedFixtureId ?? ""}
                onChange={(e) => setSelectedFixtureId(Number(e.target.value))}
                className="match-select"
              >
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {fmtKick(f)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={!identity || creating}
              onClick={() => void createRoom("live")}
              className="lobby-live"
            >
              <span className="lobby-live-title">
                <i />{" "}
                {selectedFixture?.home
                  ? `${selectedFixture.home} v ${selectedFixture.away}`
                  : "Live match"}
              </span>
              <span className="lobby-live-sub">
                Real World Cup data{fixtures.length > 1 ? " · tap to change above" : ""}
              </span>
            </button>
          </>
        )}

        <div className="mt-4 border-t border-white/10 pt-4">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
            Join Room
          </h2>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={8}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center font-display text-xl tracking-[0.2em] text-volt outline-none focus:border-volt/40"
            />
            <button
              type="button"
              onClick={joinExisting}
              className="rounded-xl border border-volt/30 bg-volt/10 px-4 font-mono text-xs text-volt"
            >
              Join
            </button>
          </div>
        </div>

        <a href="/" className="lobby-help">
          ← Back to solo
        </a>
      </div>
    </div>
  );
}
