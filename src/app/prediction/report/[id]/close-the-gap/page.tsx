import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadReportForUser, reportUrl } from "@/lib/report/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdmissionReportJson } from "@/lib/report/types";
import { PdfButton } from "../pdf-button";
import { ReportHeader } from "../report-header";
import { RichText } from "../rich-text";

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

export default async function CloseTheGapPage({ params }: PageProps) {
  const { id } = await params;
  const gapUrl = `${reportUrl(id)}/close-the-gap`;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/challenge/login?next=${encodeURIComponent(gapUrl)}`);
  }

  const report = await loadReportForUser(id, user.id);
  if (!report) notFound();

  const reportJson = isReportJson(report.report_json) ? report.report_json : null;
  const gap = reportJson?.gapRecommendations ?? null;
  const gapFocus = reportJson?.gapFocus ?? null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:py-10">
      <ReportHeader
        eyebrow="The Insight! Report"
        title="Close the Gap"
        meta="Focused, timely next steps for your biggest opportunity."
        actions={
          <>
            <Link
              href={reportUrl(id)}
              className="inline-flex items-center justify-center rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Back to report
            </Link>
            <PdfButton />
          </>
        }
      />

      {!gap ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Close-the-gap guidance is not available yet.
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            This page appears once your report finishes and we have specific
            next steps to recommend. If your report is still generating, check
            back from the report page in a few minutes.
          </p>
          <Link
            href={reportUrl(id)}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
          >
            Back to report
          </Link>
        </section>
      ) : (
        <>
          {gapFocus?.rationale && (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <p className="text-sm leading-6 text-gray-800">
                <RichText text={gapFocus.rationale} />
              </p>
            </section>
          )}

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            {gap.headline && (
              <h2 className="text-xl font-bold text-gray-900">{gap.headline}</h2>
            )}
            {gap.body && (
              <p className="mt-2 text-sm leading-6 text-gray-700">
                <RichText text={gap.body} />
              </p>
            )}

            {gap.items.length > 0 && (
              <ul className="mt-4 space-y-3">
                {gap.items.map((item) => (
                  <li
                    key={`${item.title}-${item.eventDate}`}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <h3 className="text-sm font-bold text-gray-900">
                        {item.title}
                      </h3>
                      <span className="shrink-0 text-xs font-semibold text-[#3b82f6]">
                        {item.dateKind.replace(/_/g, " ")}:{" "}
                        {formatDay(item.eventDate)}
                      </span>
                    </div>
                    {item.summary && (
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        <RichText text={item.summary} />
                      </p>
                    )}
                    <p className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-900">
                      Eligibility: {item.eligibilityNote}
                    </p>
                    <a
                      href={item.sourceUrl}
                      className="mt-2 inline-block text-xs font-semibold text-[#3b82f6]"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Verify on the official site
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {gap.handoffUrl && (
              <Link
                href={gap.handoffUrl}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
              >
                Open the Genius! Editor
              </Link>
            )}

            {gap.verifyNote && (
              <p className="mt-3 text-xs text-gray-500">{gap.verifyNote}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
