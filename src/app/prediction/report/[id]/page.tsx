import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadReportForUser, reportUrl } from "@/lib/report/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdmissionReportJson, ReportStatus } from "@/lib/report/types";
import { AutoRefresh } from "./auto-refresh";
import { ReportBody } from "./report-body";
import { ReportHeader } from "./report-header";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function isReportJson(value: unknown): value is AdmissionReportJson {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as AdmissionReportJson).version === 1 &&
    Array.isArray((value as AdmissionReportJson).schools)
  );
}

function verificationIssues(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const issues = (value as { issues?: unknown }).issues;
  return Array.isArray(issues)
    ? issues.filter((issue): issue is string => typeof issue === "string")
    : [];
}

function statusLabel(status: ReportStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Generating";
    case "completed":
      return "Ready";
    case "needs_review":
      return "Needs Review";
    case "failed":
      return "Failed";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

export default async function PredictionReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/challenge/login?next=${encodeURIComponent(reportUrl(id))}`);
  }

  const report = await loadReportForUser(id, user.id);
  if (!report) notFound();

  const reportJson = isReportJson(report.report_json) ? report.report_json : null;
  const issues = verificationIssues(report.verification_json);

  const profile = report.applicant_profile;
  const studentName = profile?.identity.name?.trim() ?? "";
  const studentSchool = profile?.education.currentSchool?.trim() ?? "";
  const subject =
    [studentName, studentSchool].filter(Boolean).join(" · ") || undefined;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:py-10">
      <ReportHeader
        title="The Insight! Report"
        subject={subject}
        meta={
          <>
            Status:{" "}
            <span className="font-semibold text-white">
              {statusLabel(report.status)}
            </span>{" "}
            · Updated {formatDate(report.updated_at)}
          </>
        }
      />

      {(report.status === "queued" || report.status === "processing") && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-[#3b82f6]"
            />
            <h2 className="text-lg font-bold text-gray-900">
              Your report is being prepared.
            </h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            A careful report takes time. We read public admissions data, compare
            real applicant cases, and double-check every chance band, so this
            usually takes{" "}
            <strong className="font-semibold text-gray-900">
              3 to 5 minutes
            </strong>
            . Reports for very competitive schools can take a little longer, and
            that extra time is what keeps the result accurate.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            You can keep this page open and step away. It updates on its own the
            moment your report is ready, so there is nothing you need to click.
          </p>
          <AutoRefresh reportId={report.id} />
        </section>
      )}

      {report.status === "failed" && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-bold text-red-900">
            Report generation failed.
          </h2>
          <p className="mt-2 text-sm text-red-800">
            {report.error_message ?? "The worker did not return a specific error."}
          </p>
        </section>
      )}

      {report.status === "needs_review" && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-900">
            This report needs internal review.
          </h2>
          <p className="mt-2 text-sm text-amber-800">
            We did not show the final report because verification found issues.
          </p>
          {issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {report.status === "completed" && reportJson && (
        <>
          <ReportBody report={reportJson} />

          {reportJson.gapRecommendations && (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Want to know how to close the gap?
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                We pulled together specific, timely next steps for the single
                biggest opportunity in your profile. To keep this report focused,
                they live on their own page.
              </p>
              <Link
                href={`${reportUrl(report.id)}/close-the-gap`}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
              >
                See how to close the gap
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
