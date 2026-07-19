import { NextResponse } from "next/server";
import {
  createRoom,
  getRoom,
  joinRoom,
  reportScore,
} from "@/room/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { action: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const room = getRoom(params.action);
  if (!room) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { action } = params;

  if (action === "create") {
    const body = (await req.json()) as {
      mode?: "replay" | "live";
      hostId?: string;
      hostLabel?: string;
    };
    if (!body.hostId || !body.hostLabel) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const room = createRoom(body.mode === "live" ? "live" : "replay", body.hostId, body.hostLabel);
    return NextResponse.json({ ok: true, room });
  }

  const body = (await req.json()) as {
    type?: "join" | "score";
    playerId?: string;
    label?: string;
    balance?: number;
  };
  if (!body.playerId || !body.label) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (body.type === "score") {
    const result = reportScore(action, body.playerId, body.label, body.balance ?? 0);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, room: result.room });
  }

  const result = joinRoom(action, body.playerId, body.label);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, room: result.room });
}
