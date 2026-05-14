import { NextResponse } from "next/server";
import { canUserAccessReport } from "@/lib/report/access";
import { REPORT_ROW_COLUMNS, reportUrl, type PredictionReportRow } from "@/lib/report/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reportId = new URL(request.url).searchParams.get("reportId");
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    console.error("prediction report status lookup failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const report = data as PredictionReportRow | null;
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (!canUserAccessReport(user.id, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    reportId: report.id,
    status: report.status,
    reportUrl: reportUrl(report.id),
    error: report.error_message,
    updatedAt: report.updated_at,
    completedAt: report.completed_at,
  });
}
