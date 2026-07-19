"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { GAME_CONFIG } from "@/game/config";
import { createGuestIdentity, useGameStore } from "@/store/gameStore";
import type { RoomState } from "@/room/store";

interface Props {
  code: string;
  onStart: () => void;
}

export function RoomWaitingRoom({ code, onStart }: Props) {
  const identity = useGameStore((s) => s.identity);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

  // 1s clock for the join countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/r/${code}`);
  }, [code]);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;

    const join = () =>
      fetch(`/api/room/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "join",
          playerId: identity.key,
          label: identity.label,
        }),
      })
        .then((r) => r.json())
        .then((d: { ok: boolean; room?: RoomState; error?: string }) => {
          if (cancelled) return;
          if (d.ok && d.room) {
            setRoom(d.room);
            if (d.room.started) onStart();
          } else {
            setError(
              d.error === "full"
                ? "Room is full (max 5 players)"
                : "Room not found"
            );
          }
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't reach the room");
        });

    join();
    const id = setInterval(join, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code, identity, onStart]);

  const copyLink = () => {
    void navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startSession = async () => {
    if (!identity || !room || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/room/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "start",
          playerId: identity.key,
          label: identity.label,
        }),
      });
      const data = (await res.json()) as { ok: boolean; room?: RoomState };
      if (data.ok) {
        onStart();
      } else {
        setStarting(false);
      }
    } catch {
      setStarting(false);
    }
  };

  const isHost = room?.hostId === identity?.key;

  const startsAt = room ? room.createdAt + GAME_CONFIG.ROOM_JOIN_WINDOW_MS : null;
  const remainMs = startsAt != null ? Math.max(0, startsAt - now) : null;
  const countdown =
    remainMs != null
      ? `${Math.floor(remainMs / 60000)}:${String(
          Math.floor((remainMs % 60000) / 1000)
        ).padStart(2, "0")}`
      : "";

  // Host auto-starts the session when the 2-minute join window elapses.
  useEffect(() => {
    if (
      isHost &&
      room &&
      !room.started &&
      remainMs === 0 &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true;
      void startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, room?.started, remainMs]);

  return (
    <div className="lobby-shell grain relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            Room code
          </p>
          <h1 className="font-display text-6xl tracking-wide text-volt">{code}</h1>
          {room && (
            <p className="mt-2 font-mono text-[11px] text-white/45">
              {room.sessionDurationId === "full"
                ? "Full match"
                : room.sessionDurationId}{" "}
              · {room.mode === "live" ? "Live" : "Demo"}
            </p>
          )}
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-card p-4">
              {joinUrl && (
                <QRCodeSVG
                  value={joinUrl}
                  size={180}
                  bgColor="#0E1626"
                  fgColor="#38BDF8"
                />
              )}
            </div>

            <button
              type="button"
              onClick={copyLink}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white/70 transition hover:bg-white/10"
            >
              {copied ? "Link copied!" : "Copy invite link"}
            </button>

            <section className="w-full">
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                Players ({room?.players.length ?? (identity ? 1 : 0)}/5)
              </h2>
              <ul className="space-y-1.5 font-mono text-sm text-white/80">
                {(room?.players ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg bg-white/5 px-3 py-2 text-left"
                  >
                    {p.label}
                    {p.id === identity?.key && (
                      <span className="ml-1.5 text-[10px] text-volt">you</span>
                    )}
                    {p.id === room?.hostId && (
                      <span className="ml-1.5 text-[10px] text-white/35">
                        host
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="w-full text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                Starts in
              </p>
              <p className="font-display text-4xl tracking-wide text-volt">
                {countdown || "—"}
              </p>
              <p className="mt-1 font-mono text-[11px] text-white/45">
                Share the code so friends can join before kickoff
              </p>
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={() => void startSession()}
                disabled={!room || starting}
                className="lobby-play w-full disabled:opacity-50"
              >
                <span>{starting ? "Starting…" : "Start now"}</span>
                <small>Skip the wait · begin immediately →</small>
              </button>
            ) : (
              <p className="font-mono text-xs text-white/45">
                Waiting for the host — session starts automatically
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
