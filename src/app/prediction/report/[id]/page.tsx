import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadReportForUser, reportUrl } from "@/lib/report/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AdmissionReportJson,
  ConfidenceLabel,
  ReportStatus,
  SourceType,
} from "@/lib/report/types";
import { AutoRefresh } from "./auto-refresh";
import { PdfButton } from "./pdf-button";
import { ReportHeader } from "./report-header";
import { RichText } from "./rich-text";

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

function confidenceClass(confidence: ConfidenceLabel): string {
  if (confidence === "high") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (confidence === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

function sourceLabel(sourceType: SourceType): string {
  if (sourceType === "x") return "Shared on X";
  if (sourceType === "reddit") return "From a Reddit discussion";
  return "From a public web source";
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

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:py-10">
      <ReportHeader
        title="The Insight! Report"
        meta={
          <>
            Status:{" "}
            <span className="font-semibold text-white">
              {statusLabel(report.status)}
            </span>{" "}
            · Updated {formatDate(report.updated_at)}
          </>
        }
        actions={<PdfButton />}
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
          <section className="grid gap-3 md:grid-cols-5">
            {reportJson.executiveSnapshot.map((snapshot) => (
              <article
                key={snapshot.school}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-base font-bold text-gray-900">
                  {snapshot.school}
                </h2>
                <p className="mt-2 text-sm font-semibold text-[#3b82f6]">
                  {snapshot.chanceBand}
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceClass(snapshot.confidence)}`}
                >
                  {snapshot.confidence} confidence
                </span>
                <p className="mt-3 text-xs text-gray-600">
                  Strongest: {snapshot.strongestFactor}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Concern: {snapshot.biggestConcern}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Applicant Read</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {Object.entries(reportJson.applicantRead).map(([label, value]) => (
                <div key={label}>
                  <h3 className="text-sm font-bold capitalize text-gray-800">
                    {label}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    <RichText text={value} />
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            {reportJson.schools.map((school) => (
              <article
                key={school.school}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {school.school}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {school.program || "Program unspecified"} ·{" "}
                      {school.round || "Round unspecified"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-lg font-bold text-[#3b82f6]">
                      {school.chanceBand}
                    </p>
                    <p className="text-xs text-gray-500">
                      {school.confidence} confidence
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Official baseline
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      <RichText text={school.officialBaseline.notes} />
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      Admit rate:{" "}
                      {school.officialBaseline.admitRatePercent === null
                        ? "Unavailable"
                        : `${school.officialBaseline.admitRatePercent}%`}
                      {school.officialBaseline.middle50Sat
                        ? ` · SAT ${school.officialBaseline.middle50Sat}`
                        : ""}
                      {school.officialBaseline.middle50Act
                        ? ` · ACT ${school.officialBaseline.middle50Act}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Student fit
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      <RichText text={school.studentFit} />
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Reasons</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      {school.reasons.map((reason) => (
                        <li key={reason}>
                          <RichText text={reason} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Actions</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      {school.actions.map((action) => (
                        <li key={action}>
                          <RichText text={action} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {school.similarCases.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-bold text-gray-900">
                      Similar public cases
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {school.similarCases.map((similarCase) => (
                        <li
                          key={similarCase.evidenceId}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
                        >
                          <p className="leading-6 text-gray-700">
                            <RichText
                              text={
                                similarCase.summary || similarCase.quoteExcerpt
                              }
                            />
                          </p>
                          <p className="mt-1.5 text-xs font-semibold text-gray-500">
                            {sourceLabel(similarCase.sourceType)}
                            {similarCase.outcome && (
                              <>
                                {" · "}
                                <span className="capitalize">
                                  {similarCase.outcome}
                                </span>
                              </>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Strategy</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                <RichText text={reportJson.strategy.schoolListBalance} />
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                <RichText text={reportJson.strategy.earlyRoundGuidance} />
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.strategy.riskNotes.map((note) => (
                  <li key={note}>
                    <RichText text={note} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Action Plan</h2>
              <h3 className="mt-3 text-sm font-bold text-gray-800">
                Next 30 days
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.next30Days.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-bold text-gray-800">
                Next 90 days
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.next90Days.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-bold text-gray-800">
                Application season
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.applicationSeason.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            </div>
          </section>

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
