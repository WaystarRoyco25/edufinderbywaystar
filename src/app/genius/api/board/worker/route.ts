import { NextResponse } from "next/server";
import { processNextQueuedGeniusBoard } from "@/lib/genius/server";

export const dynamic = "force-dynamic";

function workerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return request.headers.get("x-genius-worker-secret");
}

export async function POST(request: Request) {
  const secret = process.env.GENIUS_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "GENIUS_WORKER_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (workerToken(request) !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processNextQueuedGeniusBoard();
  return NextResponse.json(result);
}
