import { normalizeRecordingLine } from "@/streams/normalize";
import type {
  MatchEvent,
  MatchStream,
  RecordingLine,
} from "@/streams/types";

export interface ReplayStreamOptions {
  lines: RecordingLine[];
  speed?: number;
  loop?: boolean;
  /** Called when replay finishes (if not looping) */
  onEnded?: () => void;
}

/**
 * Replays a JSONL recording with original relative timing, scaled by `speed`.
 * Emits MatchEvents with stream-local timestamps (offset from first event).
 */
export class ReplayStream implements MatchStream {
  private handlers: ((event: MatchEvent) => void)[] = [];
  private lines: RecordingLine[];
  private speed: number;
  private loop: boolean;
  private onEnded?: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private running = false;
  private baseTs = 0;
  private prevOddsP: number | null = null;
  private startedWall = 0;
  private pausedElapsed = 0;
  private paused = false;

  constructor(opts: ReplayStreamOptions) {
    this.lines = opts.lines;
    this.speed = opts.speed ?? 1;
    this.loop = opts.loop ?? false;
    this.onEnded = opts.onEnded;
    if (this.lines.length > 0) {
      this.baseTs = this.lines[0].ts;
    }
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, speed);
  }

  getSpeed(): number {
    return this.speed;
  }

  subscribe(handler: (event: MatchEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedWall = Date.now();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Pause emission without resetting position (used during crash intermission). */
  pause(): void {
    this.paused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.scheduleNext();
  }

  private emit(ev: MatchEvent): void {
    for (const h of this.handlers) h(ev);
  }

  private scheduleNext(): void {
    if (!this.running || this.paused) return;
    if (this.index >= this.lines.length) {
      if (this.loop) {
        this.index = 0;
        this.prevOddsP = null;
        this.baseTs = this.lines[0]?.ts ?? 0;
        this.startedWall = Date.now();
        this.pausedElapsed = 0;
        this.scheduleNext();
        return;
      }
      this.running = false;
      this.onEnded?.();
      return;
    }

    const line = this.lines[this.index];
    const localTs = line.ts - this.baseTs;
    const prevLocal =
      this.index === 0 ? 0 : this.lines[this.index - 1].ts - this.baseTs;
    const gap = Math.max(0, (localTs - prevLocal) / this.speed);

    this.timer = setTimeout(() => {
      const ev = normalizeRecordingLine(line, localTs, this.prevOddsP);
      if (ev.type === "odds" && ev.odds) {
        this.prevOddsP = ev.odds.pGoalSoon;
      }
      this.emit(ev);
      this.index += 1;
      this.scheduleNext();
    }, gap);
  }
}

export function parseJsonl(text: string): RecordingLine[] {
  const lines: RecordingLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RecordingLine;
      if (typeof parsed.ts === "number" && "payload" in parsed) {
        lines.push(parsed);
      }
    } catch {
      // skip malformed
    }
  }
  return lines;
}
