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

// Spends one unused credit on the given report. Returns false when the
// user had no unused credit, so the caller can refuse to generate.
export async function consumeReportCredit(
  admin: SupabaseAdmin,
  userId: string,
  reportId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("report_purchases")
    .select("id")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  const { error: updateError } = await admin
    .from("report_purchases")
    .update({
      consumed_at: new Date().toISOString(),
      consumed_report_id: reportId,
    })
    .eq("id", data.id)
    .is("consumed_at", null);
  if (updateError) throw new Error(updateError.message);
  return true;
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

// Deletes the user's report intake draft. The `prediction_reports.draft_id`
// and `prediction_report_evidence.report_id` foreign keys cascade, so this
// also removes every generated report and its evidence — the "scrap and
// start fresh" path that a new purchase triggers for a returning buyer.
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
