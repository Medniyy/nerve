"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!identity) setIdentity(createGuestIdentity());
  }, [identity, setIdentity]);

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
          } else {
            setError(d.error === "full" ? "Room is full (max 5 players)" : "Room not found");
          }
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't reach the room");
        });

    join();
    const id = setInterval(join, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code, identity]);

  const copyLink = () => {
    void navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-card p-4">
              {joinUrl && (
                <QRCodeSVG value={joinUrl} size={180} bgColor="#0E1626" fgColor="#38BDF8" />
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
                  </li>
                ))}
              </ul>
            </section>

            <button
              type="button"
              onClick={onStart}
              disabled={!room}
              className="lobby-play w-full disabled:opacity-50"
            >
              <span>Start playing</span>
              <small>Others can join anytime →</small>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
