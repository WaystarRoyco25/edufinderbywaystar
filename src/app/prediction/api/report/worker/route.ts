import { NextResponse } from "next/server";
import { processNextQueuedReport } from "@/lib/report/server";

export const dynamic = "force-dynamic";
export const maxDuration = 360;

function workerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return request.headers.get("x-report-worker-secret");
}

export async function POST(request: Request) {
  const secret = process.env.REPORT_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REPORT_WORKER_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (workerToken(request) !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processNextQueuedReport();
  return NextResponse.json(result);
}
