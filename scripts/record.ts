/**
 * Record TxLINE live SSE feeds for a fixture into recordings/<matchId>.jsonl
 *
 * Usage: npm run record -- <matchId>
 *
 * Env (from TxLINE quickstart):
 *   TXLINE_API_ORIGIN  default https://txline.txodds.com
 *   TXLINE_JWT         optional — refreshed via POST /auth/guest/start if absent
 *   TXLINE_API_TOKEN   required — from POST /api/token/activate after on-chain subscribe
 *
 * Endpoints used (documented):
 *   GET {origin}/api/odds/stream?fixtureId=
 *   GET {origin}/api/scores/stream?fixtureId=
 */

import fs from "node:fs";
import path from "node:path";

const matchId = process.argv[2];
if (!matchId) {
  console.error("Usage: npm run record -- <matchId>");
  process.exit(1);
}

const origin =
  process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
const apiToken = process.env.TXLINE_API_TOKEN;
if (!apiToken) {
  console.error("TXLINE_API_TOKEN is required (see .env.example)");
  process.exit(1);
}

const outPath = path.join(process.cwd(), "recordings", `${matchId}.jsonl`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const out = fs.createWriteStream(outPath, { flags: "a" });

type SseMessage = { id?: string; event?: string; data: string };

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

async function* readSseMessages(response: Response): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("no body");
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

async function getJwt(): Promise<string> {
  if (process.env.TXLINE_JWT) return process.env.TXLINE_JWT;
  const res = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth failed: ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

function append(source: "odds" | "scores", payload: unknown) {
  try {
    out.write(
      JSON.stringify({ ts: Date.now(), source, payload }) + "\n"
    );
  } catch (err) {
    console.warn("write failed", err);
  }
}

async function streamSource(source: "odds" | "scores") {
  let backoff = 1000;
  let msgCount = 0;
  while (true) {
    try {
      let jwt = await getJwt();
      const pathName =
        source === "odds" ? "/api/odds/stream" : "/api/scores/stream";
      const url = new URL(`${origin}${pathName}`);
      url.searchParams.set("fixtureId", matchId);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${jwt}`,
          "X-Api-Token": apiToken!,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });

      if (res.status === 401) {
        delete process.env.TXLINE_JWT;
        jwt = await getJwt();
        throw new Error("401");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      backoff = 1000;
      console.log(`[record] ${source} connected → ${outPath}`);
      for await (const message of readSseMessages(res)) {
        if (message.event === "heartbeat") continue;
        try {
          const payload = JSON.parse(message.data);
          append(source, payload);
          msgCount += 1;
        } catch (err) {
          console.warn(`[record] malformed ${source} payload`, err);
          append(source, { _raw: message.data });
        }
      }
      throw new Error("stream ended");
    } catch (err) {
      console.warn(
        `[record] ${source} reconnect in ${backoff}ms`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(30_000, backoff * 2);
    }
  }
}

// Heartbeat log every 30s
setInterval(() => {
  console.log(
    `[record] heartbeat ${new Date().toISOString()} writing → ${outPath}`
  );
}, 30_000);

console.log(`[record] fixture=${matchId} origin=${origin}`);
void streamSource("odds");
void streamSource("scores");
