"use client";

import { IdentityBar } from "@/ui/IdentityBar";
import { SolanaBadge } from "@/ui/SolanaBadge";
import { useGameStore } from "@/store/gameStore";

interface LobbyProps {
  liveAvailable: boolean;
  liveFixture: {
    id: number;
    home: string;
    away: string;
    startTime: number;
  } | null;
  onPlayReplay: () => void;
  onPlayLive: () => void;
  onHelp: () => void;
}

export function Lobby({
  liveAvailable,
  liveFixture,
  onPlayReplay,
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

      <header className="lobby-header relative z-10 flex items-center justify-between">
        <SolanaBadge />
        <IdentityBar />
      </header>

      <main className="lobby-main relative z-10 flex flex-1">
        <section className="lobby-copy">
          <p className="rise-in lobby-kicker">Real match. Real pressure. One tap.</p>
          <h1 className="rise-in lobby-wordmark" style={{ animationDelay: "60ms" }}>NER<span>V</span>E</h1>
          <p className="rise-in lobby-pitch" style={{ animationDelay: "120ms" }}>
            The number climbs while nobody scores. Cash out before the next goal—or get caught holding.
          </p>

          <div
          className="rise-in lobby-actions"
          style={{ animationDelay: "180ms" }}
        >
          <button
            type="button"
            disabled={!identity}
            onClick={onPlayReplay}
            className="lobby-play"
          >
            <span>Play now</span><small>Instant guest entry →</small>
          </button>
          {liveAvailable && (
            <button
              type="button"
              disabled={!identity}
              onClick={onPlayLive}
              className="lobby-live"
            >
              <span className="lobby-live-title">
                <i /> {liveLabel}
              </span>
              {liveSub && (
                <span className="lobby-live-sub">
                  Real World Cup data · {liveSub}
                </span>
              )}
            </button>
          )}
          <a href="/sides" className="lobby-live">
            <span className="lobby-live-title">⚔ Sides — pick GOAL or HOLD vs the crowd</span>
            <span className="lobby-live-sub">
              Sealed crowd game · test USDC on devnet · new
            </span>
          </a>
          <button
            type="button"
            onClick={onHelp}
            className="lobby-help"
          >
            How does it work?
          </button>
          </div>

          <ol
          className="rise-in lobby-steps"
          style={{ animationDelay: "240ms" }}
        >
          <li>
            <span>01</span> Hold 100 pts
          </li>
          <li>
            <span>02</span> Read the pressure
          </li>
          <li>
            <span>03</span> Escape before the goal
          </li>
          </ol>
        </section>

        <section className="lobby-demo rise-in" style={{ animationDelay: "150ms" }} aria-label="Nerve game preview">
          <div className="demo-score"><span>France</span><strong>0–0</strong><span>England</span><i>67&apos;</i></div>
          <div className="demo-flight"><i className="demo-path" /><i className="demo-football">⚽</i><strong>2.47<span>×</span></strong><small>+247 pts</small></div>
          <div className="demo-weather"><span>⚡</span><div><small>Goal weather</small><strong>Heating up</strong></div><i /></div>
          <div className="demo-cash">Cash out <strong>247 pts</strong></div>
        </section>
      </main>

      <footer className="lobby-footer relative z-10">
        <span>Free to play · virtual points only · no wagering or payouts</span>
        <span>Powered by live TxLINE match data</span>
      </footer>
    </div>
  );
}
