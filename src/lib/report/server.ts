import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canUserAccessReport } from "./access";
import { normalizeApplicantProfile } from "./intake";
import { generateAdmissionReport } from "./pipeline";
import type {
  ApplicantProfile,
  EvidenceCase,
  ModelRole,
  ModelSelection,
  ReportStatus,
} from "./types";

export const REPORT_ROW_COLUMNS =
  "id, user_id, draft_id, status, applicant_profile, report_json, verification_json, model_usage, error_message, created_at, updated_at, started_at, completed_at";

export type PredictionReportRow = {
  id: string;
  user_id: string;
  // Null once the intake draft is scrapped on re-purchase; the report row and
  // its snapshotted applicant_profile/report_json survive (history is kept).
  draft_id: string | null;
  status: ReportStatus;
  applicant_profile: ApplicantProfile | null;
  report_json: unknown;
  verification_json: unknown;
  model_usage: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type SubmittedDraftRow = {
  id: string;
  user_id: string;
  payload: unknown;
  status: string;
  submitted_at: string | null;
};

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export function reportUrl(reportId: string): string {
  return `/prediction/report/${reportId}`;
}

// Loads a single report and enforces ownership. Returns null when the report
// does not exist or belongs to another user, so callers can render notFound().
export async function loadReportForUser(
  reportId: string,
  userId: string,
): Promise<PredictionReportRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const report = data as PredictionReportRow | null;
  if (!report || !canUserAccessReport(userId, report)) return null;
  return report;
}

// Every report the user has generated, newest first, for the dashboard.
export async function listReportsForUser(
  admin: SupabaseAdmin,
  userId: string,
): Promise<PredictionReportRow[]> {
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as PredictionReportRow[] | null) ?? [];
}

export async function loadSubmittedDraftForUser(
  admin: SupabaseAdmin,
  userId: string,
): Promise<SubmittedDraftRow | null> {
  const { data, error } = await admin
    .from("prediction_report_drafts")
    .select("id, user_id, payload, status, submitted_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.status !== "submitted" || !data.submitted_at) return null;
  return data as SubmittedDraftRow;
}

export async function findExistingReportForDraft(
  admin: SupabaseAdmin,
  draftId: string,
): Promise<PredictionReportRow | null> {
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PredictionReportRow | null) ?? null;
}

export async function createQueuedReport(
  admin: SupabaseAdmin,
  draft: SubmittedDraftRow,
): Promise<PredictionReportRow> {
  const profile = normalizeApplicantProfile(draft.payload);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("prediction_reports")
    .insert({
      user_id: draft.user_id,
      draft_id: draft.id,
      status: "queued",
      applicant_profile: profile,
      updated_at: now,
    })
    .select(REPORT_ROW_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create report.");
  }

  return data as PredictionReportRow;
}

async function loadOldestQueuedReport(
  admin: SupabaseAdmin,
): Promise<PredictionReportRow | null> {
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PredictionReportRow | null) ?? null;
}

async function markProcessing(
  admin: SupabaseAdmin,
  reportId: string,
): Promise<PredictionReportRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("prediction_reports")
    .update({
      status: "processing",
      started_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", reportId)
    .eq("status", "queued")
    .select(REPORT_ROW_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PredictionReportRow | null) ?? null;
}

async function loadDraftById(
  admin: SupabaseAdmin,
  draftId: string,
): Promise<SubmittedDraftRow> {
  const { data, error } = await admin
    .from("prediction_report_drafts")
    .select("id, user_id, payload, status, submitted_at")
    .eq("id", draftId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Draft not found.");
  return data as SubmittedDraftRow;
}

async function replaceReportEvidence(
  admin: SupabaseAdmin,
  reportId: string,
  evidence: EvidenceCase[],
) {
  const { error: deleteError } = await admin
    .from("prediction_report_evidence")
    .delete()
    .eq("report_id", reportId);
  if (deleteError) throw new Error(deleteError.message);

  if (evidence.length === 0) return;

  const { error: insertError } = await admin
    .from("prediction_report_evidence")
    .insert(
      evidence.map((item) => ({
        report_id: reportId,
        evidence_key: item.id,
        source_type: item.sourceType,
        school: item.school,
        cycle: item.cycle || null,
        outcome: item.outcome || null,
        round: item.round || null,
        program: item.program || null,
        applicant_facts: item.applicantFacts,
        quote_excerpt: item.quoteExcerpt,
        url: item.url,
        retrieved_at: item.retrievedAt,
        credibility_score: item.credibilityScore,
        model_id: item.modelId,
        raw: item,
      })),
    );
  if (insertError) throw new Error(insertError.message);
}

async function markReportDone(
  admin: SupabaseAdmin,
  reportId: string,
  result: {
    status: Extract<ReportStatus, "completed" | "needs_review">;
    applicantProfile: ApplicantProfile;
    report: unknown;
    verification: unknown;
    modelSelections: Record<ModelRole, ModelSelection>;
  },
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("prediction_reports")
    .update({
      status: result.status,
      applicant_profile: result.applicantProfile,
      report_json: result.report,
      verification_json: result.verification,
      model_usage: result.modelSelections,
      completed_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", reportId);
  if (error) throw new Error(error.message);
}

async function markReportFailed(
  admin: SupabaseAdmin,
  reportId: string,
  error: unknown,
) {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Unknown report generation error.";
  const { error: updateError } = await admin
    .from("prediction_reports")
    .update({
      status: "failed",
      error_message: message,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", reportId);
  if (updateError) throw new Error(updateError.message);
}

export async function processNextQueuedReport(): Promise<{
  processed: boolean;
  reportId: string | null;
  status: ReportStatus | null;
}> {
  const admin = createSupabaseAdminClient();
  const queued = await loadOldestQueuedReport(admin);
  if (!queued) return { processed: false, reportId: null, status: null };

  const report = await markProcessing(admin, queued.id);
  if (!report) return { processed: false, reportId: queued.id, status: null };

  try {
    if (!report.draft_id) {
      throw new Error(
        "The report's intake draft was removed before generation could start.",
      );
    }
    const draft = await loadDraftById(admin, report.draft_id);
    const result = await generateAdmissionReport(draft.payload);
    await replaceReportEvidence(admin, report.id, result.evidence);
    await markReportDone(admin, report.id, result);
    return { processed: true, reportId: report.id, status: result.status };
  } catch (error) {
    await markReportFailed(admin, report.id, error);
    return { processed: true, reportId: report.id, status: "failed" };
  }
}
