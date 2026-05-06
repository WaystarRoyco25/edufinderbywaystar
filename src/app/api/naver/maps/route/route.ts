import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DIRECTION_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving";

type DirectionSummary = {
  distance?: number;
  duration?: number;
  tollFare?: number;
  taxiFare?: number;
  fuelPrice?: number;
};

type RoutePathPoint = {
  lat: number;
  lng: number;
};

function getHeaders() {
  const id = process.env.NAVER_MAPS_CLIENT_ID;
  const secret = process.env.NAVER_MAPS_CLIENT_SECRET;
  if (!id || !secret) return null;
  return {
    "x-ncp-apigw-api-key-id": id,
    "x-ncp-apigw-api-key": secret,
    Accept: "application/json",
  };
}

function isKoreaLngLat(lng: number, lat: number) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= 124 &&
    lng <= 132 &&
    lat >= 33 &&
    lat <= 39
  );
}

function isLngLat(value: string | null) {
  if (!value) return false;
  const [lng, lat] = value.split(",").map(Number);
  return isKoreaLngLat(lng, lat);
}

function normalizeDirectionPath(value: unknown): RoutePathPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!isKoreaLngLat(lng, lat)) return [];
    return [{ lat, lng }];
  });
}

export async function GET(request: Request) {
  const headers = getHeaders();
  if (!headers) {
    return NextResponse.json(
      { error: "NAVER Maps server credentials are not configured." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const goal = searchParams.get("goal");

  if (!isLngLat(start) || !isLngLat(goal)) {
    return NextResponse.json({ error: "Invalid route coordinates." }, { status: 400 });
  }

  const url = new URL(DIRECTION_URL);
  url.searchParams.set("start", start!);
  url.searchParams.set("goal", goal!);
  url.searchParams.set("option", "traoptimal");
  url.searchParams.set("lang", "ko");

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: "NAVER route request failed." },
      { status: response.status },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { route?: { traoptimal?: Array<{ summary?: DirectionSummary; path?: unknown }> } }
    | null;
  const route = payload?.route?.traoptimal?.[0];
  const summary = route?.summary;
  if (!summary) {
    return NextResponse.json({ error: "No route found." }, { status: 404 });
  }

  return NextResponse.json({
    summary,
    path: normalizeDirectionPath(route?.path),
  });
}
