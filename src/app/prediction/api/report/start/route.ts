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
import {
  claimReportCredit,
  linkReportCreditToReport,
  releaseReportCredit,
} from "@/lib/report/purchase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// 800s is the Vercel Fluid compute ceiling. The start route kicks off report
// generation via after(), so it needs the same long runway as the worker.
export const maxDuration = 800;

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

    // Returning the report already generated for this draft is idempotent
    // and spends no new credit, so the credit check only gates a brand-new
    // report.
    let report = await findExistingReportForDraft(admin, draft.id);
    if (!report) {
      // Claim a credit BEFORE creating anything: the atomic claim is the
      // gate. N concurrent POSTs for a one-credit user produce exactly one
      // non-null claim; the rest get null and are turned away here.
      const creditId = await claimReportCredit(admin, user.id);
      if (!creditId) {
        return NextResponse.json(
          { error: "Purchase an Insight! Report to generate your results." },
          { status: 402 },
        );
      }
      try {
        report = await createQueuedReport(admin, draft);
      } catch (creationError) {
        // Creation failed after the credit was claimed — hand it back so the
        // buyer is not charged for a report that never queued.
        await releaseReportCredit(admin, creditId);
        throw creationError;
      }
      await linkReportCreditToReport(admin, creditId, report.id);
    }

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
