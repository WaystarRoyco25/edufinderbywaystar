import { NextResponse, after } from "next/server";
import {
  normalizeApplicantProfile,
  validateReportStartProfile,
} from "@/lib/report/intake";
import {
  createQueuedReport,
  findExistingReportForDraft,
  loadSubmittedDraftForUser,
  processNextQueuedReport,
  reportUrl,
} from "@/lib/report/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 360;

async function getAuthenticatedUser() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user;
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();

  try {
    const draft = await loadSubmittedDraftForUser(admin, user.id);
    if (!draft) {
      return NextResponse.json(
        { error: "Submit the report intake before starting generation." },
        { status: 409 },
      );
    }

    const profileIssues = validateReportStartProfile(
      normalizeApplicantProfile(draft.payload),
    );
    if (profileIssues.length > 0) {
      return NextResponse.json({ error: profileIssues.join(" ") }, { status: 400 });
    }

    const existing = await findExistingReportForDraft(admin, draft.id);
    const report = existing ?? (await createQueuedReport(admin, draft));

    after(() => processNextQueuedReport());

    return NextResponse.json({
      reportId: report.id,
      status: report.status,
      reportUrl: reportUrl(report.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start report.";
    console.error("prediction report start failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
