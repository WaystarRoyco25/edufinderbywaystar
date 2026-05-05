import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const PLACE_SEARCH_URL = "https://naveropenapi.apigw.ntruss.com/map-place/v1/search";
const LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";
const MAX_LOOKUPS_PER_REQUEST = 120;
const DEFAULT_SEARCH_COORDINATE = "127.0276,37.4979";
const cache = new Map<string, LookupResult>();

type InstitutionInput = {
  name?: unknown;
  address?: unknown;
  category?: unknown;
};

type LookupResult = {
  name: string;
  address: string | null;
  roadAddress?: string | null;
  lat: number | null;
  lng: number | null;
  mapx?: number | null;
  mapy?: number | null;
  source: "address" | "place-search" | "local-search" | "unresolved";
  status: "ok" | "unresolved";
};

type GeocodeAddress = {
  roadAddress?: string;
  jibunAddress?: string;
  x?: string;
  y?: string;
};

type LocalSearchItem = {
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
};

type PlaceSearchPlace = {
  name?: string;
  address?: string;
  road_address?: string;
  roadAddress?: string;
  x?: string;
  y?: string;
};

function getNaverMapsHeaders() {
  const id = process.env.NAVER_MAPS_CLIENT_ID;
  const secret = process.env.NAVER_MAPS_CLIENT_SECRET;
  if (!id || !secret) return null;
  return {
    "x-ncp-apigw-api-key-id": id,
    "x-ncp-apigw-api-key": secret,
    Accept: "application/json",
  };
}

function getLocalSearchHeaders() {
  const id = process.env.NAVER_LOCAL_SEARCH_CLIENT_ID;
  const secret = process.env.NAVER_LOCAL_SEARCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return {
    "X-Naver-Client-Id": id,
    "X-Naver-Client-Secret": secret,
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function makeCacheKey(input: { name: string; address: string | null; category: string }) {
  return [input.category, input.name, input.address ?? ""].join("|");
}

function unresolved(name: string, address: string | null): LookupResult {
  return { name, address, lat: null, lng: null, source: "unresolved", status: "unresolved" };
}

async function geocodeAddress(name: string, address: string): Promise<LookupResult | null> {
  const headers = getNaverMapsHeaders();
  if (!headers) return null;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("query", address);
  url.searchParams.set("count", "1");

  const response = await fetch(url, { headers, cache: "force-cache" });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | { addresses?: GeocodeAddress[] }
    | null;
  const first = payload?.addresses?.[0];
  const lng = Number(first?.x);
  const lat = Number(first?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    name,
    address,
    roadAddress: first?.roadAddress || address,
    lat,
    lng,
    source: "address",
    status: "ok",
  };
}

function scoreLocalResult(name: string, item: LocalSearchItem): number {
  const normalizedName = normalizeForMatch(name);
  const title = normalizeForMatch(item.title || "");
  const category = normalizeForMatch(item.category || "");
  let score = 0;
  if (title === normalizedName) score += 8;
  if (title.includes(normalizedName) || normalizedName.includes(title)) score += 4;
  if (/학교|학원|어학|교육|유학|컨설팅|유치원/.test(category)) score += 2;
  if (item.roadAddress) score += 1;
  return score;
}

async function searchLocalPlace(
  name: string,
  category: string,
): Promise<LookupResult | null> {
  const headers = getLocalSearchHeaders();
  if (!headers) return null;

  const url = new URL(LOCAL_SEARCH_URL);
  const categoryHint = category === "hagwon" ? " 학원" : "";
  url.searchParams.set("query", `${name}${categoryHint}`);
  url.searchParams.set("display", "5");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");

  const response = await fetch(url, { headers, cache: "force-cache" });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | { items?: LocalSearchItem[] }
    | null;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const best = items
    .map((item) => ({ item, score: scoreLocalResult(name, item) }))
    .sort((a, b) => b.score - a.score)[0]?.item;
  const mapx = Number(best?.mapx);
  const mapy = Number(best?.mapy);
  if (!Number.isFinite(mapx) || !Number.isFinite(mapy)) return null;

  return {
    name,
    address: best?.roadAddress || best?.address || null,
    roadAddress: best?.roadAddress || null,
    lat: null,
    lng: null,
    mapx,
    mapy,
    source: "local-search",
    status: "ok",
  };
}

function scorePlaceSearchResult(name: string, item: PlaceSearchPlace): number {
  const normalizedName = normalizeForMatch(name);
  const placeName = normalizeForMatch(item.name || "");
  let score = 0;
  if (placeName === normalizedName) score += 8;
  if (placeName.includes(normalizedName) || normalizedName.includes(placeName)) score += 4;
  if (item.road_address || item.roadAddress) score += 1;
  return score;
}

async function searchNaverMapPlace(
  name: string,
  category: string,
): Promise<LookupResult | null> {
  const headers = getNaverMapsHeaders();
  if (!headers) return null;

  const url = new URL(PLACE_SEARCH_URL);
  const categoryHint = category === "hagwon" ? " 학원" : "";
  url.searchParams.set("query", `${name}${categoryHint}`);
  url.searchParams.set("coordinate", DEFAULT_SEARCH_COORDINATE);

  const response = await fetch(url, { headers, cache: "force-cache" });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | { places?: PlaceSearchPlace[] }
    | null;
  const places = Array.isArray(payload?.places) ? payload.places : [];
  const best = places
    .map((item) => ({ item, score: scorePlaceSearchResult(name, item) }))
    .sort((a, b) => b.score - a.score)[0]?.item;
  const lng = Number(best?.x);
  const lat = Number(best?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const roadAddress = best?.road_address || best?.roadAddress || null;
  return {
    name,
    address: roadAddress || best?.address || null,
    roadAddress,
    lat,
    lng,
    source: "place-search",
    status: "ok",
  };
}

async function resolveInstitution(input: {
  name: string;
  address: string | null;
  category: string;
}): Promise<LookupResult> {
  const cacheKey = makeCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let result: LookupResult | null = null;
  if (input.address) {
    result = await geocodeAddress(input.name, input.address);
  }
  if (!result) {
    result = await geocodeAddress(input.name, input.name);
  }
  result ??= await searchNaverMapPlace(input.name, input.category);
  result ??= await searchLocalPlace(input.name, input.category);
  result ??= unresolved(input.name, input.address);

  cache.set(cacheKey, result);
  return result;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(values[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { institutions?: InstitutionInput[]; category?: unknown }
    | null;

  if (!body || !Array.isArray(body.institutions)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const category = cleanText(body.category) || "institution";
  const institutions = body.institutions
    .slice(0, MAX_LOOKUPS_PER_REQUEST)
    .map((item) => ({
      name: cleanText(item.name),
      address: cleanText(item.address) || null,
      category: cleanText(item.category) || category,
    }))
    .filter((item) => item.name);

  const locations = await mapWithConcurrency(institutions, 4, resolveInstitution);
  const locatedCount = locations.filter((item) => item.status === "ok").length;

  return NextResponse.json({
    locations,
    locatedCount,
    unresolvedCount: locations.length - locatedCount,
  });
}
