import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.NAVER_MAPS_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "NAVER Maps client ID is not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    clientId,
    geocodingAvailable: Boolean(process.env.NAVER_MAPS_CLIENT_SECRET),
  });
}
