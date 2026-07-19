import {
  normalizeOddsPayload,
  normalizeScoresPayload,
} from "@/streams/normalize";
import type { MatchEvent, MatchStream } from "@/streams/types";

/**
 * Browser-facing live stream.
 * Connects to same-origin Next.js proxies that attach TxLINE credentials server-side:
 *   GET /api/txline/odds-stream?fixtureId=
 *   GET /api/txline/scores-stream?fixtureId=
 *
 * Proxies forward to documented TxLINE SSE endpoints:
 *   GET {origin}/api/odds/stream
 *   GET {origin}/api/scores/stream
 * Auth (server only): Authorization Bearer JWT + X-Api-Token
 * (see https://txline.txodds.com/documentation/examples/streaming-data)
 */

export interface LiveStreamOptions {
  fixtureId?: string | number;
  /** Override proxy base (default: "") */
  proxyBase?: string;
  onRaw?: (msg: {
    ts: number;
    source: "odds" | "scores";
    payload: unknown;
  }) => void;
}

type SseMessage = {
  id?: string;
  event?: string;
  data: string;
};

function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separatorIndex = rawLine.indexOf(":");
    const field =
      separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    const value =
      separatorIndex === -1
        ? ""
        : rawLine.slice(separatorIndex + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

async function* readSseMessages(
  response: Response
): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.match(/\r?\n\r?\n/);
      while (separator?.index !== undefined) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const message = parseSseBlock(block);
        if (message) yield message;
        separator = buffer.match(/\r?\n\r?\n/);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class LiveStream implements MatchStream {
  private handlers: ((event: MatchEvent) => void)[] = [];
  private opts: LiveStreamOptions;
  private abort: AbortController | null = null;
  private running = false;
  private baseTs: number | null = null;
  private prevOddsP: number | null = null;

  constructor(opts: LiveStreamOptions = {}) {
    this.opts = opts;
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
    this.abort = new AbortController();
    void this.runLoop("scores");
    void this.runLoop("odds");
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
    this.abort = null;
  }

  private emit(ev: MatchEvent): void {
    for (const h of this.handlers) h(ev);
  }

  private localTs(wall: number): number {
    if (this.baseTs == null) this.baseTs = wall;
    return wall - this.baseTs;
  }

  private async runLoop(source: "odds" | "scores"): Promise<void> {
    const base = this.opts.proxyBase ?? "";
    const fixtureId =
      this.opts.fixtureId ??
      process.env.NEXT_PUBLIC_TXLINE_FIXTURE_ID;
    let backoff = 1000;

    while (this.running) {
      try {
        const path =
          source === "odds"
            ? "/api/txline/odds-stream"
            : "/api/txline/scores-stream";
        const url = new URL(path, window.location.origin);
        if (base) {
          // absolute override
        }
        if (fixtureId) url.searchParams.set("fixtureId", String(fixtureId));

        const res = await fetch(url.toString(), {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
          },
          signal: this.abort?.signal,
        });

        if (res.status === 503) {
          console.warn(
            "[LiveStream] Live feed not configured on server (TXLINE_API_TOKEN)"
          );
          return;
        }
        if (!res.ok) throw new Error(`${source} proxy HTTP ${res.status}`);

        backoff = 1000;
        for await (const message of readSseMessages(res)) {
          if (!this.running) break;
          if (message.event === "heartbeat") continue;
          let payload: unknown = message.data;
          try {
            payload = JSON.parse(message.data);
          } catch {
            /* keep string */
          }
          const wall = Date.now();
          this.opts.onRaw?.({ ts: wall, source, payload });
          const local = this.localTs(wall);
          if (source === "odds") {
            const ev = normalizeOddsPayload(payload, local, this.prevOddsP);
            if (ev.odds) this.prevOddsP = ev.odds.pGoalSoon;
            this.emit(ev);
          } else {
            this.emit(normalizeScoresPayload(payload, local));
          }
        }
      } catch (err) {
        if (!this.running) break;
        console.warn(`[LiveStream] ${source} reconnect in ${backoff}ms`, err);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(30_000, backoff * 2);
      }
    }
  }
}
