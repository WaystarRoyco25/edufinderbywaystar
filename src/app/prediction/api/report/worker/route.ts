import { NextResponse } from "next/server";
import { processNextQueuedReport } from "@/lib/report/server";

export const dynamic = "force-dynamic";
// 800s is the Vercel Fluid compute ceiling. A thorough report can run several
// minutes, so we give generation the longest runway the platform allows.
export const maxDuration = 800;

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
