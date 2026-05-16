import type {
  AdmissionReportJson,
  ConfidenceLabel,
  SourceType,
} from "@/lib/report/types";
import { RichText } from "./rich-text";

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

// The body of the Insight! Report, shared by the report page and the
// printable copy bundled into the Close the Gap PDF export. Every card carries
// `break-inside-avoid` so a box never splits across two printed pages.
export function ReportBody({ report }: { report: AdmissionReportJson }) {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-5">
        {report.executiveSnapshot.map((snapshot) => (
          <article
            key={snapshot.school}
            className="break-inside-avoid rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
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

      <section className="break-inside-avoid rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Applicant Read</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Object.entries(report.applicantRead).map(([label, value]) => (
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
        {report.schools.map((school) => (
          <article
            key={school.school}
            className="break-inside-avoid rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
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
                      className="break-inside-avoid rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
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
        <div className="break-inside-avoid rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Strategy</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            <RichText text={report.strategy.schoolListBalance} />
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            <RichText text={report.strategy.earlyRoundGuidance} />
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {report.strategy.riskNotes.map((note) => (
              <li key={note}>
                <RichText text={note} />
              </li>
            ))}
          </ul>
        </div>
        <div className="break-inside-avoid rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Action Plan</h2>
          <h3 className="mt-3 text-sm font-bold text-gray-800">
            Next 30 days
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {report.actionPlan.next30Days.map((item) => (
              <li key={item}>
                <RichText text={item} />
              </li>
            ))}
          </ul>
          <h3 className="mt-3 text-sm font-bold text-gray-800">
            Next 90 days
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {report.actionPlan.next90Days.map((item) => (
              <li key={item}>
                <RichText text={item} />
              </li>
            ))}
          </ul>
          <h3 className="mt-3 text-sm font-bold text-gray-800">
            Application season
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {report.actionPlan.applicationSeason.map((item) => (
              <li key={item}>
                <RichText text={item} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
