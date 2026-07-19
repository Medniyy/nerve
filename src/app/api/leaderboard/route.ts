import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Entry {
  key: string;
  label: string;
  balance: number;
}

const ZKEY = "nerve:leaderboard";
const META = "nerve:leaderboard:meta:";

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
}

export async function GET() {
  if (!kvConfigured()) {
    return NextResponse.json({ entries: [], source: "none" });
  }
  try {
    const rows = await kv.zrange<string[]>(ZKEY, 0, 9, {
      rev: true,
      withScores: true,
    });
    // @vercel/kv withScores returns [member, score, member, score, ...]
    const entries: Entry[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const key = String(rows[i]);
      const balance = Number(rows[i + 1]);
      let label = key;
      try {
        const meta = await kv.get<{ label?: string }>(META + key);
        if (meta?.label) label = meta.label;
      } catch {
        /* ignore */
      }
      entries.push({ key, label, balance });
    }
    return NextResponse.json({ entries, source: "kv" });
  } catch (err) {
    console.warn("leaderboard GET failed", err);
    return NextResponse.json({ entries: [], source: "error" });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Entry>;
  if (!body.key || typeof body.balance !== "number") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const entry: Entry = {
    key: body.key,
    label: body.label ?? body.key,
    balance: body.balance,
  };

  if (!kvConfigured()) {
    return NextResponse.json({ entries: [entry], source: "local" });
  }

  try {
    await kv.zadd(ZKEY, { score: entry.balance, member: entry.key });
    await kv.set(META + entry.key, { label: entry.label });
    const rows = await kv.zrange<string[]>(ZKEY, 0, 9, {
      rev: true,
      withScores: true,
    });
    const entries: Entry[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const key = String(rows[i]);
      const balance = Number(rows[i + 1]);
      let label = key;
      try {
        const meta = await kv.get<{ label?: string }>(META + key);
        if (meta?.label) label = meta.label;
      } catch {
        /* ignore */
      }
      entries.push({ key, label, balance });
    }
    return NextResponse.json({ entries, source: "kv" });
  } catch (err) {
    console.warn("leaderboard POST failed", err);
    return NextResponse.json({ entries: [entry], source: "error" });
  }
}
