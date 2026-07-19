import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NERVE — Demo",
  description: "NERVE product demo.",
};

export default function PitchPage() {
  return (
    <main className="pitch-page grain relative flex min-h-[100dvh] flex-col text-white">
      <div className="pointer-events-none absolute inset-0 bg-pitch-scene" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />

      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
          NERVE DEMO
        </h1>

        <div className="pitch-player mt-6 overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
          <video
            className="aspect-video w-full bg-black"
            controls
            playsInline
            preload="metadata"
            poster="/pitch/poster.jpg"
            controlsList="nodownload"
          >
            <source src="/pitch/hophop.mp4" type="video/mp4" />
          </video>
        </div>

        <Link href="/" className="lobby-play mt-5 w-fit !min-h-0 !py-3 !px-5">
          <span className="!text-lg">Open the game</span>
        </Link>
      </section>
    </main>
  );
}
