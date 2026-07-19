import { NextResponse } from "next/server";
import { getSportsFixtures } from "@/sides/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const fixtures = await getSportsFixtures();
    return NextResponse.json({ fixtures, fetchedAt: Date.now() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sports feed unavailable",
        fixtures: [],
      },
      { status: 503 }
    );
  }
}

