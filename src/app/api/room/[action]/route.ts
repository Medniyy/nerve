import { NextResponse } from "next/server";
import {
  cancelPlayerHold,
  holdRelease,
  holdStart,
  startRoomSession,
} from "@/room/session";
import {
  createRoom,
  getRoom,
  joinRoom,
  rankedPlayers,
  type RoomState,
} from "@/room/store";
import type { SessionDurationId } from "@/game/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { action: string };
}

function enrich(room: RoomState) {
  return {
    ...room,
    leaderboard: rankedPlayers(room),
  };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const room = getRoom(params.action);
  if (!room) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room: enrich(room) });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { action } = params;

  if (action === "create") {
    const body = (await req.json()) as {
      mode?: "replay" | "live";
      hostId?: string;
      hostLabel?: string;
      sessionDurationId?: SessionDurationId;
      fixtureId?: number;
    };
    if (!body.hostId || !body.hostLabel) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const room = createRoom({
      mode: body.mode === "live" ? "live" : "replay",
      hostId: body.hostId,
      hostLabel: body.hostLabel,
      sessionDurationId: body.sessionDurationId,
      fixtureId: body.fixtureId,
    });
    return NextResponse.json({ ok: true, room: enrich(room) });
  }

  const body = (await req.json()) as {
    type?:
      | "join"
      | "start"
      | "hold_start"
      | "hold_release"
      | "reconnect";
    playerId?: string;
    label?: string;
    sessionDurationId?: SessionDurationId;
  };

  if (body.type === "start") {
    const room = getRoom(action);
    if (!room) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (body.playerId && body.playerId !== room.hostId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const started = startRoomSession(action);
    if (!started) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, room: enrich(started) });
  }

  if (!body.playerId || !body.label) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (body.type === "hold_start") {
    const result = holdStart(action, body.playerId);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, room: enrich(result.room) });
  }

  if (body.type === "hold_release") {
    const result = holdRelease(action, body.playerId);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, room: enrich(result.room) });
  }

  if (body.type === "reconnect") {
    const result = joinRoom(action, body.playerId, body.label);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    cancelPlayerHold(action, body.playerId);
    return NextResponse.json({ ok: true, room: enrich(result.room) });
  }

  const result = joinRoom(action, body.playerId, body.label);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, room: enrich(result.room) });
}
