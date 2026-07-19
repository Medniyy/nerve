"use client";

import type { EngineSnapshot } from "@/game/engine";
import { useEffect, useRef } from "react";

interface Props {
  snap: EngineSnapshot;
  crashing: boolean;
}

type Zone = EngineSnapshot["dangerZone"];

const ZONE_COLOR: Record<Zone, string> = {
  CALM: "#38BDF8",
  BUILDING: "#FFB020",
  CRITICAL: "#FF3B1F",
};

const RUNNING = new Set(["open", "holding"]);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface AnimState {
  points: { t: number; m: number }[];
  roundStart: number | null;
  displayMult: number;
  yMax: number;
  rotation: number;
  prevRunning: boolean;
  crashAt: number | null; // frozen multiplier at crash
  particles: Particle[];
  lastTs: number;
  ballX: number;
  ballY: number;
}

/**
 * Real-time crash-style graph. A football is pinned to the newest endpoint of
 * a progressively drawn exponential curve; its position is derived every frame
 * from the live game-state multiplier (never a separate scripted path). Canvas +
 * requestAnimationFrame, time-based (not frame-count) so speed is device-independent.
 */
export function MultiplierDisplay({ snap, crashing }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const crashingRef = useRef(crashing);
  crashingRef.current = crashing;

  const stateRef = useRef<AnimState>({
    points: [],
    roundStart: null,
    displayMult: 1,
    yMax: 2,
    rotation: 0,
    prevRunning: false,
    crashAt: null,
    particles: [],
    lastTs: 0,
    ballX: 0,
    ballY: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const st = stateRef.current;
    let raf = 0;

    const drawBall = (
      x: number,
      y: number,
      radius: number,
      rot: number,
      color: string,
      alpha: number
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      // glow
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.9);
      g.addColorStop(0, color + "aa");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.fill();

      ctx.translate(x, y);
      ctx.rotate(rot);
      // shadow under ball
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      // sphere
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      const sphere = ctx.createRadialGradient(
        -radius * 0.35,
        -radius * 0.4,
        radius * 0.2,
        0,
        0,
        radius
      );
      sphere.addColorStop(0, "#ffffff");
      sphere.addColorStop(1, "#c7d2e0");
      ctx.fillStyle = sphere;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      // classic football pattern: centre pentagon + radiating seams
      ctx.fillStyle = "#0b1220";
      ctx.strokeStyle = "#0b1220";
      ctx.lineWidth = radius * 0.14;
      const pent = radius * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const px = Math.cos(a) * pent;
        const py = Math.sin(a) * pent;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * pent, Math.sin(a) * pent);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.stroke();
      }
      ctx.restore();
    };

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const dt = st.lastTs ? Math.min(0.05, (ts - st.lastTs) / 1000) : 0.016;
      st.lastTs = ts;

      const s = snapRef.current;
      const running = RUNNING.has(s.phase);
      const color = ZONE_COLOR[s.dangerZone];

      // Round reset: entering a running phase fresh, or multiplier fell back to ~1
      if (
        (running && !st.prevRunning) ||
        (running && s.multiplier < st.displayMult - 0.25)
      ) {
        st.points = [];
        st.roundStart = ts;
        st.displayMult = Math.max(1, s.multiplier);
        st.yMax = 2;
        st.crashAt = null;
        st.particles = [];
      }

      if (running) {
        if (st.roundStart == null) st.roundStart = ts;
        const target = Math.max(1, s.multiplier);
        // time-based smoothing toward the true game-state multiplier
        const k = 1 - Math.exp(-dt / 0.09);
        st.displayMult += (target - st.displayMult) * k;
        const elapsed = (ts - st.roundStart) / 1000;
        const last = st.points[st.points.length - 1];
        if (!last || elapsed - last.t > 0.02) {
          st.points.push({ t: elapsed, m: st.displayMult });
          if (st.points.length > 4000) st.points.shift();
        }
        st.crashAt = null;
      } else if (s.phase === "crashed" && st.crashAt == null && st.points.length) {
        // freeze final value, spawn the impact burst once
        st.crashAt = st.displayMult;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + Math.random();
          const sp = 60 + Math.random() * 140;
          st.particles.push({
            x: st.ballX,
            y: st.ballY,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 40,
            life: 1,
          });
        }
      }
      st.prevRunning = running;

      // Y-axis auto-scale (smooth)
      const targetYMax = Math.max(2, st.displayMult * 1.28);
      st.yMax += (targetYMax - st.yMax) * (1 - Math.exp(-dt / 0.3));

      // ── layout ──
      const padL = 10;
      const padR = 10;
      const padT = 14;
      const padB = 12;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const pxPerSec = plotW / 12;
      const anchor = padL + plotW * 0.75;

      const pts = st.points;
      const newestT = pts.length ? pts[pts.length - 1].t : 0;
      const naturalNewestX = padL + newestT * pxPerSec;
      const cam = Math.max(0, naturalNewestX - anchor);
      const sx = (t: number) => padL + t * pxPerSec - cam;
      const sy = (m: number) =>
        padT + plotH * (1 - (m - 1) / Math.max(0.001, st.yMax - 1));

      // rotation from horizontal speed (slightly faster when steeper)
      const slope =
        pts.length > 1
          ? Math.abs(
              sy(pts[pts.length - 1].m) - sy(pts[pts.length - 2].m)
            ) / 6
          : 0;
      if (running) st.rotation += dt * (2.2 + Math.min(6, slope));

      // ── draw ──
      ctx.clearRect(0, 0, W, H);

      // baseline grid — horizontal multiplier ticks
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "10px 'IBM Plex Mono', monospace";
      const tickStep = st.yMax <= 3 ? 0.5 : st.yMax <= 6 ? 1 : 2;
      for (let mv = 1; mv <= st.yMax; mv += tickStep) {
        const yy = sy(mv);
        ctx.beginPath();
        ctx.moveTo(padL, yy);
        ctx.lineTo(W - padR, yy);
        ctx.stroke();
        ctx.fillText(`${mv.toFixed(mv < 10 ? 1 : 0)}×`, W - padR - 26, yy - 3);
      }

      if (pts.length > 1) {
        // area under curve
        ctx.beginPath();
        ctx.moveTo(sx(pts[0].t), sy(1));
        for (const p of pts) ctx.lineTo(sx(p.t), sy(p.m));
        ctx.lineTo(sx(newestT), sy(1));
        ctx.closePath();
        const area = ctx.createLinearGradient(0, padT, 0, H);
        area.addColorStop(0, color + "3a");
        area.addColorStop(1, color + "00");
        ctx.fillStyle = area;
        ctx.fill();

        // bright line with glow
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const X = sx(p.t);
          const Y = sy(p.m);
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // football at newest endpoint
      const bx = pts.length ? sx(newestT) : padL;
      const by = pts.length ? sy(st.displayMult) : sy(1);
      st.ballX = bx;
      st.ballY = by;
      const radius = Math.max(13, Math.min(22, Math.min(W, H) * 0.04));

      if (s.phase === "crashed" && st.crashAt != null) {
        // particles burst; ball fades / drops
        for (const p of st.particles) {
          p.vy += 320 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 1.4;
        }
        st.particles = st.particles.filter((p) => p.life > 0);
        ctx.save();
        for (const p of st.particles) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = "#FF3B1F";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        const fall = (1 - Math.max(0, st.crashAt != null ? 1 : 0)) * 0;
        drawBall(bx, by + fall, radius, st.rotation, "#FF3B1F", 0.25);
      } else if (pts.length) {
        drawBall(bx, by, radius, st.rotation, color, 1);
      }

      // ── text overlays (canvas, always smooth) ──
      const showNum = running || s.phase === "crashed";
      if (showNum) {
        const val = (st.crashAt ?? st.displayMult).toFixed(2);
        const size = Math.min(W * 0.15, H * 0.46, 132);
        ctx.font = `${size}px Anton, Impact, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        const numY = padT + size * 0.82;
        ctx.fillStyle = "rgba(255,255,255,0.97)";
        ctx.fillText(val, padL + 6, numY);
        const w = ctx.measureText(val).width;
        ctx.font = `${size * 0.4}px Anton, Impact, sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText("×", padL + 12 + w, numY);

        // small caption
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText(
          s.holding
            ? `${Math.floor(s.stake * (st.crashAt ?? st.displayMult)).toLocaleString()} PTS IN HAND`
            : s.phase === "crashed"
              ? "ROUND OVER"
              : "LIVE MULTIPLIER",
          padL + 8,
          numY + 18
        );
      }

      // state overlays: countdown / next round
      if (!running && s.phase !== "crashed") {
        let label = "NEXT ROUND";
        if (s.intermissionEndsAt) {
          const rem = (s.intermissionEndsAt - Date.now()) / 1000;
          if (rem > 0 && rem <= 3.5) label = String(Math.ceil(rem));
        }
        const big = label.length <= 2;
        ctx.font = `${big ? Math.min(H * 0.5, 120) : Math.min(W * 0.07, 44)}px Anton, Impact, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, W / 2, H / 2);
        ctx.textAlign = "left";
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const zoneClass = snap.dangerZone.toLowerCase();
  return (
    <section
      ref={wrapRef}
      className={`climb-stage climb-${zoneClass} ${crashing ? "is-crashing" : ""}`}
      aria-label={`Live multiplier ${snap.multiplier.toFixed(2)} times`}
    >
      <canvas ref={canvasRef} className="climb-canvas" />
      <div className="climb-speed" aria-hidden>
        <span />
        <span />
        <span />
        <small>
          {snap.dangerZone === "CRITICAL"
            ? "climbing fast"
            : snap.dangerZone === "BUILDING"
              ? "speeding up"
              : "steady climb"}
        </small>
      </div>
    </section>
  );
}
