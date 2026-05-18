import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Insight! Report purchase credits. Each row in `report_purchases` with a
 * NULL `consumed_at` is one unused report credit. Generating a report
 * spends one credit; scrapping a report never refunds it.
 */

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

// How many paid-but-unused report credits the user currently holds.
export async function countAvailableReportCredits(
  admin: SupabaseAdmin,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("report_purchases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Atomically claims one unused report credit for the user. Returns the
// claimed report_purchases.id, or null when the user holds no unused credit.
//
// `UPDATE ... WHERE id = ? AND consumed_at IS NULL` is atomic per row, so two
// concurrent claims of the same row can never both win. The loop lets a user
// holding several credits fall through to the next free row when a concurrent
// request grabs the one this call pre-selected, instead of a spurious refusal.
export async function claimReportCredit(
  admin: SupabaseAdmin,
  userId: string,
): Promise<string | null> {
  // Bounded so a pathological storm of concurrent requests cannot spin
  // forever; far beyond any realistic per-user credit count.
  for (let attempt = 0; attempt < 25; attempt++) {
    const { data: candidate, error: selectError } = await admin
      .from("report_purchases")
      .select("id")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (!candidate) return null;

    const { data: claimed, error: claimError } = await admin
      .from("report_purchases")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (claimed) return claimed.id;
    // A concurrent request claimed this row first — retry with the next one.
  }
  return null;
}

// Links a freshly claimed credit to the report it paid for. Best-effort: the
// credit is already spent, so a failure here is logged but never fails the
// caller's generation flow.
export async function linkReportCreditToReport(
  admin: SupabaseAdmin,
  creditId: string,
  reportId: string,
): Promise<void> {
  const { error } = await admin
    .from("report_purchases")
    .update({ consumed_report_id: reportId })
    .eq("id", creditId);
  if (error) {
    console.error("linkReportCreditToReport failed", { creditId, reportId, error });
  }
}

// Returns a claimed credit to the unused pool when report creation failed
// after the claim. Guards on consumed_report_id IS NULL so a credit already
// linked to a report can never be released out from under it.
export async function releaseReportCredit(
  admin: SupabaseAdmin,
  creditId: string,
): Promise<void> {
  const { error } = await admin
    .from("report_purchases")
    .update({ consumed_at: null })
    .eq("id", creditId)
    .is("consumed_report_id", null);
  if (error) {
    console.error("releaseReportCredit failed", { creditId, error });
  }
}

// True once the user has at least one generated report. Used to tell a
// first-time buyer apart from a returning buyer who is starting over.
export async function userHasGeneratedReport(
  admin: SupabaseAdmin,
  userId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("prediction_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// Deletes the user's report intake draft so a returning buyer starts from a
// blank intake. The `prediction_reports.draft_id` foreign key is ON DELETE
// SET NULL, so previously generated reports (and their evidence) are kept and
// stay visible in the dashboard; only the draft is scrapped.
export async function scrapUserReportData(
  admin: SupabaseAdmin,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("prediction_report_drafts")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
