import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireDashboardUser } from "@/lib/dashboard/guard";
import { loadServiceOwnership } from "@/lib/dashboard/ownership";
import { countAvailableReportCredits } from "@/lib/report/purchase";
import {
  listReportsForUser,
  reportUrl,
  type PredictionReportRow,
} from "@/lib/report/server";
import type { ReportStatus } from "@/lib/report/types";
import CrossSellCard from "../cross-sell-card";
import EmbeddedDraftFrame from "../embedded-draft-frame";
import SignOutButton from "../sign-out-button";

export const dynamic = "force-dynamic";

type DashboardSearchParams = Promise<{
  draft?: string | string[];
}>;

function hasFlag(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

const STATUS_META: Record<ReportStatus, { label: string; className: string }> = {
  completed: { label: "Ready", className: "bg-blue-50 text-[#3b82f6]" },
  needs_review: {
    label: "Needs review",
    className: "bg-amber-50 text-amber-600",
  },
  processing: { label: "Generating", className: "bg-blue-50 text-[#3b82f6]" },
  queued: { label: "Queued", className: "bg-gray-100 text-gray-600" },
  failed: { label: "Failed", className: "bg-red-50 text-red-600" },
};

export default async function InsightDashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const params = await searchParams;
  const draftRequested = hasFlag(params.draft);
  const user = await requireDashboardUser(
    draftRequested
      ? "/dashboard/prediction?draft=1"
      : "/dashboard/prediction",
  );

  const admin = createSupabaseAdminClient();
  const [reports, credits, ownership] = await Promise.all([
    listReportsForUser(admin, user.id),
    countAvailableReportCredits(admin, user.id),
    loadServiceOwnership(admin, user.id),
  ]);
  const showDraft = draftRequested && credits > 0;

  return (
    <main className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-6 py-3">
          <p className="min-w-0 truncate text-xs text-gray-500">
            Signed in as{" "}
            <span className="font-medium text-gray-700">{user.email}</span>
          </p>
          <div className="shrink-0">
            <SignOutButton />
          </div>
        </div>

        <div className="space-y-5 p-6">
          <h1 className="text-3xl font-bold tracking-wide">
            The Insight! Report
          </h1>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <ReportCreditsStatus
              credits={credits}
              hasReports={reports.length > 0}
            />
            <div className="shrink-0">
              <Link
                href={
                  credits > 0
                    ? "/dashboard/prediction?draft=1"
                    : "/prediction/purchase"
                }
                className="block w-full rounded-lg bg-[#3b82f6] px-5 py-2.5 text-center font-semibold text-white shadow transition hover:bg-[#2563eb] sm:inline-block sm:w-auto"
              >
                {credits > 0 ? "Generate a Report" : "Buy a Report"}
              </Link>
              <p className="mt-2 text-xs text-gray-500 sm:text-right">
                Each report covers up to five colleges on your list.
              </p>
            </div>
          </div>
        </div>
      </section>

      {showDraft && (
        <EmbeddedDraftFrame
          title="Draft your Insight! Report"
          description="Complete the admissions intake here, then submit it to generate the report."
          src="/prediction?embed=dashboard&start=1"
          closeHref="/dashboard/prediction"
          heightClassName="h-[940px]"
          showHeader={false}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-800 border-b-2 border-[#3b82f6] pb-2">
          Your Reports
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
            You have not generated an Insight! Report yet. Every report you
            generate will be saved here.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      {!ownership.genius && <CrossSellCard service="genius" />}
    </main>
  );
}

function ReportCreditsStatus({
  credits,
  hasReports,
}: {
  credits: number;
  hasReports: boolean;
}) {
  const positive = credits > 0;
  let detail: string;
  if (positive) {
    detail = "You can generate a new Insight! Report now.";
  } else if (hasReports) {
    detail = "Buy another report to run a fresh analysis.";
  } else {
    detail = "Buy a report to get your first analysis.";
  }
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-2xl font-bold ${
          positive ? "bg-blue-50 text-[#3b82f6]" : "bg-amber-50 text-amber-600"
        }`}
      >
        {credits}
      </div>
      <div className="text-sm">
        <p className="text-base font-semibold">
          Report {credits === 1 ? "credit" : "credits"} available
        </p>
        <p className="mt-0.5 text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: PredictionReportRow }) {
  const status = STATUS_META[report.status];
  const schools =
    report.applicant_profile?.targetSchools
      .map((school) => school.name.trim())
      .filter((name) => name.length > 0) ?? [];

  return (
    <li className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-800">
              Report generated on {formatDate(report.created_at)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          {schools.length > 0 ? (
            <p className="text-gray-600">
              {schools.length} {schools.length === 1 ? "school" : "schools"}:{" "}
              {schools.join(", ")}
            </p>
          ) : (
            <p className="text-gray-500">Target schools were not recorded.</p>
          )}
          {report.status === "failed" && report.error_message && (
            <p className="text-red-600">{report.error_message}</p>
          )}
        </div>
        <Link
          href={reportUrl(report.id)}
          className="shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3b82f6]"
        >
          View report
        </Link>
      </div>
    </li>
  );
}
