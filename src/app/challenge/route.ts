import { readFile } from "fs/promises";
import path from "path";

// Serves public/challenge.html at the clean URL /challenge.
//
// The rewrite approach in next.config.ts does not work here because the
// src/app/challenge/ folder (which holds the login/dashboard/module
// sub-routes) intercepts /challenge before the rewrite can fire. A route
// handler at src/app/challenge/route.ts matches exactly /challenge and
// leaves the sub-routes (/challenge/login etc.) untouched.
//
// force-static bakes the HTML into the build output so there is no
// per-request filesystem read on Vercel.
export const dynamic = "force-static";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "challenge.html");
  const html = await readFile(filePath, "utf-8");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
