"use client";

import { IdentityBar } from "@/ui/IdentityBar";
import { SolanaBadge } from "@/ui/SolanaBadge";
import { TxLineBadge } from "@/ui/TxLineBadge";
import { useGameStore } from "@/store/gameStore";

interface Fixture {
  id: number;
  home: string;
  away: string;
  startTime: number;
}

interface LobbyProps {
  liveAvailable: boolean;
  liveFixture: Fixture | null;
  fixtures: Fixture[];
  selectedFixtureId: number | null;
  onSelectFixture: (id: number) => void;
  onPlaySolo: () => void;
  onPlayLive: () => void;
  onHelp: () => void;
}

export function Lobby({
  liveAvailable,
  liveFixture,
  fixtures,
  selectedFixtureId,
  onSelectFixture,
  onPlaySolo,
  onPlayLive,
  onHelp,
}: LobbyProps) {
  const identity = useGameStore((s) => s.identity);

  const kickedOff =
    liveFixture != null &&
    liveFixture.startTime > 0 &&
    liveFixture.startTime <= Date.now();
  const liveLabel =
    liveFixture && liveFixture.home
      ? `${liveFixture.home} v ${liveFixture.away}`
      : "Live match";
  const liveSub =
    liveFixture && liveFixture.startTime > 0 && !kickedOff
      ? `kicks off ${new Date(liveFixture.startTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : null;

  return (
    <div className="lobby-shell grain relative flex min-h-[100dvh] flex-col overflow-hidden">
      <div className="lobby-video" aria-hidden>
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/media/nerve-stadium-poster.webp"
        >
          <source src="/media/nerve-stadium-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <header className="lobby-header relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <TxLineBadge />
          <SolanaBadge />
        </div>
        <div className="flex justify-center sm:justify-end">
          <IdentityBar />
        </div>
      </header>

      <main className="lobby-main relative z-10 flex flex-1">
        <section className="lobby-copy">
          <h1 className="rise-in lobby-wordmark">
            NER<span>V</span>E
          </h1>
          <p className="rise-in lobby-pitch" style={{ animationDelay: "60ms" }}>
            Feel every possession. Share the adrenaline.
          </p>

          <div
            className="rise-in lobby-actions"
            style={{ animationDelay: "120ms" }}
          >
            <button
              type="button"
              disabled={!identity}
              onClick={onPlaySolo}
              className="lobby-btn is-primary"
            >
              <span className="lobby-btn-title">Play Solo</span>
              <span className="lobby-btn-sub">Demo match · choose duration</span>
            </button>
            {liveAvailable && (
              <>
                {fixtures.length > 1 && (
                  <select
                    aria-label="Choose live match"
                    value={selectedFixtureId ?? ""}
                    onChange={(e) => onSelectFixture(Number(e.target.value))}
                    className="match-select"
                  >
                    {fixtures.map((f) => {
                      const off = f.startTime > 0 && f.startTime <= Date.now();
                      const t =
                        f.startTime > 0 && !off
                          ? new Date(f.startTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "LIVE";
                      return (
                        <option key={f.id} value={f.id}>
                          {f.home} v {f.away} · {t}
                        </option>
                      );
                    })}
                  </select>
                )}
                <button
                  type="button"
                  disabled={!identity}
                  onClick={onPlayLive}
                  className="lobby-btn is-secondary"
                >
                  <span className="lobby-btn-title">
                    <i className="lobby-btn-dot" /> {liveLabel}
                  </span>
                  <span className="lobby-btn-sub">
                    Real World Cup data{liveSub ? ` · ${liveSub}` : ""}
                  </span>
                </button>
              </>
            )}
            <a href="/r" className="lobby-btn is-secondary">
              <span className="lobby-btn-title">Create Room</span>
              <span className="lobby-btn-sub">Share a code or QR · up to 5 players</span>
            </a>
            <a href="/r" className="lobby-btn is-secondary">
              <span className="lobby-btn-title">Join Room</span>
              <span className="lobby-btn-sub">Open a friend&apos;s room link</span>
            </a>
            <button type="button" onClick={onHelp} className="lobby-howto">
              How does it work?
            </button>
          </div>
        </section>

        <section
          className="lobby-demo rise-in"
          style={{ animationDelay: "150ms" }}
          aria-label="Nerve game preview"
        >
          <div className="demo-score">
            <span>Brazil</span>
            <strong>1–0</strong>
            <span>Argentina</span>
            <i>23&apos;</i>
          </div>
          <p className="demo-poss">BRAZIL IN POSSESSION</p>
          <div className="demo-meter" aria-label="Attack intensity preview">
            <span className="seg-safe is-on">Safe</span>
            <span className="seg-attack is-on">Attack</span>
            <span className="seg-danger is-on is-current">Danger</span>
            <span className="seg-highdanger">High</span>
          </div>
          <div className="demo-hold">
            <strong>48</strong>
            <small>Current Hold · +4/s</small>
          </div>
          <div className="demo-cash">Release to lock · Total 312</div>
        </section>
      </main>
    </div>
  );
}
