/** Simple Web Audio heartbeat + crash sting. Muted by default. */

let ctx: AudioContext | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let enabled = false;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopHeartbeat();
  else if (ctx?.state === "suspended") void ctx.resume();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function startHeartbeat(dangerLevel: number): void {
  if (!enabled) return;
  stopHeartbeat();
  const bpm = 60 + Math.min(120, dangerLevel * 1.4);
  const interval = 60_000 / bpm;
  const beat = () => {
    if (!enabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 55 + dangerLevel * 0.4;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(c.destination);
    const t = c.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
  };
  beat();
  heartbeatTimer = setInterval(beat, interval);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function playCrashSting(): void {
  if (!enabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.45);
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(c.destination);
  const t = c.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.start(t);
  osc.stop(t + 0.55);
}
