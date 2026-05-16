import {
  normalizeApplicantProfile,
  validateReportStartProfile,
} from "./intake";
import {
  resolveReportModels,
  type ModelAvailabilityClient,
} from "./provider-registry";
import {
  HttpReportProviderClient,
  makeEmptySchoolReport,
  type ReportProviderClient,
} from "./provider-client";
import {
  buildStaticGapRecommendations,
  resolveGapFocus,
  validateGapRecommendations,
} from "./gap";
import type {
  AdmissionReportJson,
  ApplicantProfile,
  ChanceBand,
  ConfidenceLabel,
  EvidenceCase,
  ModelRole,
  ModelSelection,
  ReportStatus,
  SchoolReport,
  VerificationResult,
} from "./types";

export type ReportPipelineResult = {
  status: Extract<ReportStatus, "completed" | "needs_review">;
  applicantProfile: ApplicantProfile;
  evidence: EvidenceCase[];
  report: AdmissionReportJson;
  verification: VerificationResult;
  modelSelections: Record<ModelRole, ModelSelection>;
};

export type ReportPipelineOptions = {
  providerClient?: ReportProviderClient;
  env?: Record<string, string | undefined>;
  now?: Date;
};

const GUARANTEE_PATTERNS = [
  "guaranteed admission",
  "guaranteed acceptance",
  "will be admitted",
  "will get in",
  "certain acceptance",
  "certain admission",
];

function sameSchool(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function evidenceScore(profile: ApplicantProfile, evidence: EvidenceCase): number {
  let score = evidence.credibilityScore;
  if (evidence.program && profile.major) {
    const program = evidence.program.toLowerCase();
    const major = profile.major.toLowerCase();
    if (program.includes(major) || major.includes(program)) score += 0.15;
  }
  if (evidence.sourceType === "google") score += 0.3;
  if (evidence.sourceType === "x" || evidence.sourceType === "reddit") score += 0.1;
  if (evidence.cycle && /\b202[4-6]\b/.test(evidence.cycle)) score += 0.1;
  return score;
}

export function rankEvidenceForProfile(
  profile: ApplicantProfile,
  evidence: EvidenceCase[],
): EvidenceCase[] {
  return [...evidence].sort((a, b) => {
    const schoolDelta =
      Number(profile.targetSchools.some((school) => sameSchool(school.name, b.school))) -
      Number(profile.targetSchools.some((school) => sameSchool(school.name, a.school)));
    if (schoolDelta) return schoolDelta;
    return evidenceScore(profile, b) - evidenceScore(profile, a);
  });
}

function hasGoogleEvidence(evidence: EvidenceCase[], school: string): boolean {
  return evidence.some((item) => sameSchool(item.school, school) && item.sourceType === "google");
}

function hasComparableCase(evidence: EvidenceCase[], school: string): boolean {
  return evidence.some(
    (item) =>
      sameSchool(item.school, school) &&
      (item.sourceType === "x" || item.sourceType === "reddit"),
  );
}

function lowerConfidence(confidence: ConfidenceLabel, target: ConfidenceLabel): ConfidenceLabel {
  if (target === "low") return "low";
  if (confidence === "high") return "medium";
  return confidence;
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function applySchoolGuardrails(
  schoolReport: SchoolReport,
  evidence: EvidenceCase[],
): SchoolReport {
  const googleSourced = hasGoogleEvidence(evidence, schoolReport.school);
  const comparable = hasComparableCase(evidence, schoolReport.school);
  let next = schoolReport;

  if (!googleSourced || !comparable) {
    const missing = [
      googleSourced ? "" : "google sources",
      comparable ? "" : "comparable public cases",
    ].filter(Boolean);
    const note = `Confidence lowered because collected evidence is missing ${missing.join(" and ")}.`;
    next = {
      ...next,
      confidence: lowerConfidence(next.confidence, !googleSourced && !comparable ? "low" : "medium"),
      reasons: appendUnique(next.reasons, note),
    };
  }

  if (
    typeof next.officialBaseline.admitRatePercent === "number" &&
    next.officialBaseline.admitRatePercent < 10 &&
    next.chanceBand === "Likely"
  ) {
    next = {
      ...next,
      chanceBand: "Reach",
      reasons: appendUnique(
        next.reasons,
        "Ultra-selective admit rates cannot be labeled Likely.",
      ),
    };
  }

  return next;
}

export function applyEvidenceGuardrails(
  report: AdmissionReportJson,
  evidence: EvidenceCase[],
): AdmissionReportJson {
  const schools = report.schools.map((school) => applySchoolGuardrails(school, evidence));
  const bySchool = new Map(schools.map((school) => [school.school, school]));

  return {
    ...report,
    schools,
    executiveSnapshot: report.executiveSnapshot.map((snapshot) => {
      const school = bySchool.get(snapshot.school);
      if (!school) return snapshot;
      return {
        ...snapshot,
        chanceBand: school.chanceBand,
        confidence: school.confidence,
      };
    }),
  };
}

function issue(message: string, issues: string[]) {
  if (!issues.includes(message)) issues.push(message);
}

function containsGuaranteeLanguage(report: AdmissionReportJson): boolean {
  const haystack = JSON.stringify(report).toLowerCase();
  return GUARANTEE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function verifySimilarCaseQuotes(
  report: AdmissionReportJson,
  evidence: EvidenceCase[],
  issues: string[],
) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  for (const school of report.schools) {
    for (const similarCase of school.similarCases) {
      const source = evidenceById.get(similarCase.evidenceId);
      if (!source) {
        issue(
          `${school.school} cites missing evidence ${similarCase.evidenceId}.`,
          issues,
        );
        continue;
      }
      if (similarCase.quoteExcerpt !== source.quoteExcerpt) {
        issue(
          `${school.school} quote for ${similarCase.evidenceId} does not match stored excerpt.`,
          issues,
        );
      }
    }
  }
}

function verifyOfficialStats(report: AdmissionReportJson, issues: string[]) {
  for (const school of report.schools) {
    const hasStats =
      school.officialBaseline.admitRatePercent !== null ||
      Boolean(school.officialBaseline.middle50Sat) ||
      Boolean(school.officialBaseline.middle50Act);
    if (hasStats && school.officialBaseline.evidenceIds.length === 0) {
      issue(`${school.school} official baseline has stats without evidence IDs.`, issues);
    }
  }
}

function verifyChanceBands(report: AdmissionReportJson, issues: string[]) {
  for (const school of report.schools) {
    const admitRate = school.officialBaseline.admitRatePercent;
    if (typeof admitRate === "number" && admitRate < 10 && school.chanceBand === "Likely") {
      issue(`${school.school} is ultra-selective and cannot be labeled Likely.`, issues);
    }
  }
}

export function verifyReportIntegrity(
  report: AdmissionReportJson,
  evidence: EvidenceCase[],
  now = new Date(),
  modelId: string = "local-integrity",
): VerificationResult {
  const issues: string[] = [];

  verifySimilarCaseQuotes(report, evidence, issues);
  verifyOfficialStats(report, issues);
  verifyChanceBands(report, issues);
  if (containsGuaranteeLanguage(report)) {
    issue("Report contains admissions guarantee language.", issues);
  }

  return {
    passed: issues.length === 0,
    checkedAt: now.toISOString(),
    modelId,
    issues,
  };
}

function reportAppendix(evidence: EvidenceCase[]): AdmissionReportJson["evidenceAppendix"] {
  return evidence.map((item) => ({
    evidenceId: item.id,
    sourceType: item.sourceType,
    school: item.school,
    url: item.url,
    retrievedAt: item.retrievedAt,
    quoteExcerpt: item.quoteExcerpt,
  }));
}

function buildEmergencyDraft(
  profile: ApplicantProfile,
  evidence: EvidenceCase[],
  generatedAt: string,
): AdmissionReportJson {
  const schools = profile.targetSchools
    .filter((school) => school.name)
    .map((school) => makeEmptySchoolReport(school, evidence, generatedAt));

  return {
    version: 1,
    generatedAt,
    executiveSnapshot: schools.map((school) => ({
      school: school.school,
      chanceBand: school.chanceBand as ChanceBand,
      confidence: school.confidence,
      strongestFactor: "Draft unavailable",
      biggestConcern: "Report requires model review before release.",
      evidenceIds: [],
    })),
    applicantRead: {
      academics: "Pending model-generated analysis.",
      testing: "Pending model-generated analysis.",
      curriculum: "Pending model-generated analysis.",
      activities: "Pending model-generated analysis.",
      awards: "Pending model-generated analysis.",
      leadership: "Pending model-generated analysis.",
      context: "Pending model-generated analysis.",
    },
    schools,
    strategy: {
      schoolListBalance: "Pending model-generated strategy.",
      earlyRoundGuidance: "Pending model-generated strategy.",
      riskNotes: ["The report pipeline did not produce a verified final report."],
    },
    actionPlan: {
      next30Days: ["Confirm all intake details and retry report generation."],
      next90Days: ["Review official admissions requirements for each target school."],
      applicationSeason: ["Do not rely on this placeholder as final admissions guidance."],
    },
    evidenceAppendix: reportAppendix(evidence),
  };
}

async function collectEvidenceForProfile(
  profile: ApplicantProfile,
  providerClient: ReportProviderClient,
  modelSelections: Record<ModelRole, ModelSelection>,
  now: Date,
): Promise<EvidenceCase[]> {
  const targetSchools = profile.targetSchools.filter((item) => item.name);
  const perSchool = await Promise.all(
    targetSchools.map((school) =>
      Promise.all([
        providerClient.collectXEvidence({
          profile,
          school,
          modelId: modelSelections.xEvidence.modelId,
          now,
        }),
        providerClient.collectGoogleAndRedditEvidence({
          profile,
          school,
          modelId: modelSelections.googleEvidence.modelId,
          now,
        }),
      ]),
    ),
  );
  const evidence = perSchool.flat(2);
  return rankEvidenceForProfile(profile, evidence);
}

async function draftWithLocalVerify(
  profile: ApplicantProfile,
  evidence: EvidenceCase[],
  providerClient: ReportProviderClient,
  modelSelections: Record<ModelRole, ModelSelection>,
  now: Date,
): Promise<{ report: AdmissionReportJson; verification: VerificationResult }> {
  const drafted = await providerClient.draftReport({
    profile,
    evidence,
    modelSelections,
    modelId: modelSelections.drafting.modelId,
  });
  let report = applyEvidenceGuardrails(
    {
      ...drafted,
      generatedAt: drafted.generatedAt || now.toISOString(),
      evidenceAppendix: drafted.evidenceAppendix?.length
        ? drafted.evidenceAppendix
        : reportAppendix(evidence),
    },
    evidence,
  );

  let verification = verifyReportIntegrity(report, evidence, now);
  if (verification.passed) return { report, verification };

  const fixerModelId = modelSelections.xEvidence.modelId;
  const fixed = await providerClient.fixReportIssues({
    profile,
    evidence,
    report,
    issues: verification.issues,
    modelId: fixerModelId,
  });
  report = applyEvidenceGuardrails(
    {
      ...fixed,
      generatedAt: fixed.generatedAt || report.generatedAt,
      gapFocus: fixed.gapFocus ?? report.gapFocus,
      evidenceAppendix: fixed.evidenceAppendix?.length
        ? fixed.evidenceAppendix
        : report.evidenceAppendix,
    },
    evidence,
  );
  verification = verifyReportIntegrity(report, evidence, now, `${fixerModelId}+local`);
  return { report, verification };
}

// Best-effort enrichment computed after the report is already verified. A
// failure here must never demote the report — it just omits the recommendations.
async function attachGapRecommendations(
  report: AdmissionReportJson,
  profile: ApplicantProfile,
  providerClient: ReportProviderClient,
  modelSelections: Record<ModelRole, ModelSelection>,
  now: Date,
): Promise<AdmissionReportJson> {
  const gapFocus = resolveGapFocus(report, profile);

  if (gapFocus.lane === "essays" || gapFocus.lane === "longer_term") {
    return {
      ...report,
      gapFocus,
      gapRecommendations: buildStaticGapRecommendations(gapFocus, now),
    };
  }

  try {
    const raw = await providerClient.collectGapRecommendations({
      profile,
      gapFocus,
      modelId: modelSelections.drafting.modelId,
      now,
    });
    return {
      ...report,
      gapFocus,
      gapRecommendations: validateGapRecommendations(raw, gapFocus, now),
    };
  } catch {
    return { ...report, gapFocus };
  }
}

export async function generateAdmissionReport(
  draftPayload: unknown,
  options: ReportPipelineOptions = {},
): Promise<ReportPipelineResult> {
  const now = options.now ?? new Date();
  const providerClient = options.providerClient ?? new HttpReportProviderClient({ env: options.env });
  const profile = normalizeApplicantProfile(draftPayload);
  const validationIssues = validateReportStartProfile(profile);

  if (validationIssues.length > 0) {
    throw new Error(validationIssues.join(" "));
  }

  const modelSelections = await resolveReportModels(
    providerClient as ModelAvailabilityClient,
    options.env,
    now,
  );
  const evidence = await collectEvidenceForProfile(
    profile,
    providerClient,
    modelSelections,
    now,
  );

  const result = await draftWithLocalVerify(
    profile,
    evidence,
    providerClient,
    modelSelections,
    now,
  );

  const reportWithGap = await attachGapRecommendations(
    result.report,
    profile,
    providerClient,
    modelSelections,
    now,
  );

  return {
    status: result.verification.passed ? "completed" : "needs_review",
    applicantProfile: profile,
    evidence,
    report: reportWithGap,
    verification: result.verification,
    modelSelections,
  };
}

export function buildNeedsReviewResult(
  draftPayload: unknown,
  error: Error,
  now = new Date(),
): Omit<ReportPipelineResult, "modelSelections"> & {
  modelSelections: Record<ModelRole, ModelSelection> | null;
} {
  const profile = normalizeApplicantProfile(draftPayload);
  const evidence: EvidenceCase[] = [];
  const report = buildEmergencyDraft(profile, evidence, now.toISOString());
  return {
    status: "needs_review",
    applicantProfile: profile,
    evidence,
    report,
    verification: {
      passed: false,
      checkedAt: now.toISOString(),
      modelId: "local-error",
      issues: [error.message],
    },
    modelSelections: null,
  };
}
