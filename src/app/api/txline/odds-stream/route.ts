import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxies TxLINE odds SSE so TXLINE_API_TOKEN stays server-side.
 * Upstream: GET {TXLINE_API_ORIGIN}/api/odds/stream?fixtureId=
 */
export async function GET(req: NextRequest) {
  const origin =
    process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) {
    return new Response("Live feed not configured", { status: 503 });
  }

  let jwt = process.env.TXLINE_JWT;
  if (!jwt) {
    const auth = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
    if (!auth.ok) {
      return new Response("Guest auth failed", { status: 502 });
    }
    const data = (await auth.json()) as { token?: string };
    jwt = data.token;
  }
  if (!jwt) return new Response("Missing JWT", { status: 502 });

  const fixtureId =
    req.nextUrl.searchParams.get("fixtureId") ??
    process.env.TXLINE_FIXTURE_ID;
  const url = new URL(`${origin}/api/odds/stream`);
  if (fixtureId) url.searchParams.set("fixtureId", fixtureId);

  const upstream = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream ${upstream.status}`, {
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
