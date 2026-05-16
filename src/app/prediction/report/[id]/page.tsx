import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canUserAccessReport } from "@/lib/report/access";
import {
  REPORT_ROW_COLUMNS,
  reportUrl,
  type PredictionReportRow,
} from "@/lib/report/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AdmissionReportJson,
  ConfidenceLabel,
  ModelSelection,
  ReportStatus,
  SourceType,
} from "@/lib/report/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type EvidenceRow = {
  evidence_key: string;
  source_type: SourceType;
  school: string;
  quote_excerpt: string;
  url: string;
  retrieved_at: string;
  credibility_score: number;
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

function modelSelections(value: unknown): ModelSelection[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>).filter(
    (selection): selection is ModelSelection =>
      Boolean(selection) &&
      typeof selection === "object" &&
      typeof (selection as ModelSelection).modelId === "string",
  );
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

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function loadReport(id: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("prediction_reports")
    .select(REPORT_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const report = data as PredictionReportRow | null;
  if (!report || !canUserAccessReport(userId, report)) return null;

  const { data: evidenceRows, error: evidenceError } = await admin
    .from("prediction_report_evidence")
    .select(
      "evidence_key, source_type, school, quote_excerpt, url, retrieved_at, credibility_score",
    )
    .eq("report_id", report.id)
    .order("school", { ascending: true });

  if (evidenceError) throw new Error(evidenceError.message);
  return {
    report,
    evidenceRows: (evidenceRows ?? []) as EvidenceRow[],
  };
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

  const loaded = await loadReport(id, user.id);
  if (!loaded) notFound();

  const { report, evidenceRows } = loaded;
  const reportJson = isReportJson(report.report_json) ? report.report_json : null;
  const issues = verificationIssues(report.verification_json);
  const selections = modelSelections(report.model_usage);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-10 space-y-8">
      <header className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/prediction" className="text-sm font-semibold text-amber-700">
              EduFinder Insight Report
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">
              College Admission Report
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Status:{" "}
              <span className="font-semibold text-gray-900">
                {statusLabel(report.status)}
              </span>{" "}
              · Updated {formatDate(report.updated_at)}
            </p>
          </div>
          <Link
            href={reportUrl(report.id)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Refresh
          </Link>
        </div>
      </header>

      {(report.status === "queued" || report.status === "processing") && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-bold text-amber-900">
            Your report is being prepared.
          </h2>
          <p className="mt-2 text-sm text-amber-800">
            The worker will collect Google web, Reddit, and X evidence before
            the report is released. Refresh this page or call the status
            endpoint to check progress.
          </p>
        </section>
      )}

      {report.status === "failed" && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-bold text-red-900">Report generation failed.</h2>
          <p className="mt-2 text-sm text-red-800">
            {report.error_message ?? "The worker did not return a specific error."}
          </p>
        </section>
      )}

      {report.status === "needs_review" && (
        <section className="rounded-lg border border-orange-200 bg-orange-50 p-5">
          <h2 className="text-lg font-bold text-orange-900">
            This report needs internal review.
          </h2>
          <p className="mt-2 text-sm text-orange-800">
            We did not show the final report because verification found issues.
          </p>
          {issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-orange-900">
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
                <h2 className="text-base font-bold text-gray-900">{snapshot.school}</h2>
                <p className="mt-2 text-sm font-semibold text-amber-700">
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
                  <h3 className="text-sm font-bold capitalize text-gray-800">{label}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{value}</p>
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
                    <h2 className="text-xl font-bold text-gray-900">{school.school}</h2>
                    <p className="text-sm text-gray-500">
                      {school.program || "Program unspecified"} ·{" "}
                      {school.round || "Round unspecified"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-lg font-bold text-amber-700">{school.chanceBand}</p>
                    <p className="text-xs text-gray-500">{school.confidence} confidence</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Official baseline</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      {school.officialBaseline.notes}
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
                    <h3 className="text-sm font-bold text-gray-900">Student fit</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      {school.studentFit}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Reasons</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      {school.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Actions</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      {school.actions.map((action) => (
                        <li key={action}>{action}</li>
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
                          <p className="text-gray-700">
                            &ldquo;{similarCase.quoteExcerpt}&rdquo;
                          </p>
                          <a
                            href={similarCase.url}
                            className="mt-1 inline-block text-xs font-semibold text-amber-700"
                            rel="noreferrer"
                            target="_blank"
                          >
                            {similarCase.sourceType.toUpperCase()} source
                          </a>
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
                {reportJson.strategy.schoolListBalance}
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                {reportJson.strategy.earlyRoundGuidance}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.strategy.riskNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Action Plan</h2>
              <h3 className="mt-3 text-sm font-bold text-gray-800">Next 30 days</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.next30Days.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-bold text-gray-800">Next 90 days</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.next90Days.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-bold text-gray-800">
                Application season
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {reportJson.actionPlan.applicationSeason.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {reportJson.gapRecommendations && (
            <section className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
              <details className="group">
                <summary className="cursor-pointer text-xl font-bold text-amber-900">
                  Want to know how to close the gap?
                </summary>
                <div className="mt-4 space-y-4">
                  {reportJson.gapFocus?.rationale && (
                    <p className="text-sm leading-6 text-amber-900">
                      {reportJson.gapFocus.rationale}
                    </p>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {reportJson.gapRecommendations.headline}
                    </h3>
                    {reportJson.gapRecommendations.body && (
                      <p className="mt-1 text-sm leading-6 text-gray-700">
                        {reportJson.gapRecommendations.body}
                      </p>
                    )}
                  </div>

                  {reportJson.gapRecommendations.items.length > 0 && (
                    <ul className="space-y-3">
                      {reportJson.gapRecommendations.items.map((item) => (
                        <li
                          key={`${item.title}-${item.eventDate}`}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                        >
                          <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                            <h4 className="text-sm font-bold text-gray-900">
                              {item.title}
                            </h4>
                            <span className="shrink-0 text-xs font-semibold text-amber-700">
                              {item.dateKind.replace(/_/g, " ")}:{" "}
                              {formatDay(item.eventDate)}
                            </span>
                          </div>
                          {item.summary && (
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                              {item.summary}
                            </p>
                          )}
                          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            Eligibility: {item.eligibilityNote}
                          </p>
                          <a
                            href={item.sourceUrl}
                            className="mt-2 inline-block text-xs font-semibold text-amber-700"
                            rel="noreferrer"
                            target="_blank"
                          >
                            Verify on the official site
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {reportJson.gapRecommendations.handoffUrl && (
                    <Link
                      href={reportJson.gapRecommendations.handoffUrl}
                      className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
                    >
                      Open the Genius! Editor
                    </Link>
                  )}

                  {reportJson.gapRecommendations.verifyNote && (
                    <p className="text-xs text-gray-500">
                      {reportJson.gapRecommendations.verifyNote}
                    </p>
                  )}
                </div>
              </details>
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Evidence Appendix</h2>
        {evidenceRows.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No evidence rows have been stored yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {evidenceRows.map((evidence) => (
              <li key={evidence.evidence_key} className="py-3 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {evidence.school} · {evidence.source_type.toUpperCase()}
                    </p>
                    <p className="mt-1 text-gray-600">
                      &ldquo;{evidence.quote_excerpt}&rdquo;
                    </p>
                    <a
                      href={evidence.url}
                      className="mt-1 inline-block text-xs font-semibold text-amber-700"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open source
                    </a>
                  </div>
                  <p className="text-xs text-gray-500">
                    Retrieved {formatDate(evidence.retrieved_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selections.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Model Audit</h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {selections.map((selection) => (
              <li key={selection.role} className="rounded-lg border border-gray-100 p-3 text-sm">
                <p className="font-semibold text-gray-900">
                  {selection.role}: {selection.modelId}
                </p>
                <p className="text-xs text-gray-500">
                  {selection.provider} · {selection.availability}
                  {selection.reason ? ` · ${selection.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
