export type ReportStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review";

export type SourceType = "google" | "reddit" | "x";

export type ConfidenceLabel = "high" | "medium" | "low";

export type ChanceBand =
  | "Very High Reach"
  | "High Reach"
  | "Reach"
  | "Borderline Target"
  | "Target"
  | "Likely";

export type TargetSchool = {
  index: number;
  name: string;
  program: string;
  round: string;
};

export type ApplicantProfile = {
  identity: {
    name: string;
    email: string;
  };
  education: {
    grade: string;
    graduationYear: string;
    currentSchool: string;
    citizenship: string;
    applicationType: string;
  };
  major: string;
  academics: {
    gpaUnweighted: string;
    gpaWeighted: string;
    gradingScale: string;
    gradeTrend: string;
    classRank: string;
    courseRigor: string;
    currentCourses: string;
    apIbTrack: string;
    apIbDetail: string;
  };
  testing: {
    satTotal: string;
    satSection: string;
    actTotal: string;
    englishTest: string;
    testingPlan: string;
  };
  activities: {
    extracurriculars: string;
    awards: string;
    leadership: string;
  };
  targetSchools: TargetSchool[];
  notes: string;
  rawFields: ReportPayload;
};

export type EvidenceCase = {
  id: string;
  sourceType: SourceType;
  school: string;
  cycle: string;
  outcome: string;
  round: string;
  program: string;
  applicantFacts: Record<string, string>;
  quoteExcerpt: string;
  url: string;
  retrievedAt: string;
  credibilityScore: number;
  modelId: string;
};

export type ModelProvider = "gemini" | "xai";

export type ModelRole = "googleEvidence" | "xEvidence" | "drafting";

export type ModelSelection = {
  role: ModelRole;
  provider: ModelProvider;
  preferredModel: string;
  modelId: string;
  candidates: string[];
  checkedAt: string;
  availability:
    | "available"
    | "fallback"
    | "unchecked"
    | "unavailable";
  reason: string | null;
};

export type SchoolSnapshot = {
  school: string;
  chanceBand: ChanceBand;
  confidence: ConfidenceLabel;
  strongestFactor: string;
  biggestConcern: string;
  evidenceIds: string[];
};

export type SimilarCase = {
  evidenceId: string;
  sourceType: SourceType;
  outcome: string;
  quoteExcerpt: string;
  url: string;
};

export type SchoolReport = {
  school: string;
  program: string;
  round: string;
  chanceBand: ChanceBand;
  confidence: ConfidenceLabel;
  officialBaseline: {
    admitRatePercent: number | null;
    middle50Sat: string;
    middle50Act: string;
    notes: string;
    evidenceIds: string[];
  };
  studentFit: string;
  similarCases: SimilarCase[];
  reasons: string[];
  actions: string[];
};

export type AdmissionReportJson = {
  version: 1;
  generatedAt: string;
  executiveSnapshot: SchoolSnapshot[];
  applicantRead: {
    academics: string;
    testing: string;
    curriculum: string;
    activities: string;
    awards: string;
    leadership: string;
    context: string;
  };
  schools: SchoolReport[];
  strategy: {
    schoolListBalance: string;
    earlyRoundGuidance: string;
    riskNotes: string[];
  };
  actionPlan: {
    next30Days: string[];
    next90Days: string[];
    applicationSeason: string[];
  };
  evidenceAppendix: Array<{
    evidenceId: string;
    sourceType: SourceType;
    school: string;
    url: string;
    retrievedAt: string;
    quoteExcerpt: string;
  }>;
};

export type VerificationResult = {
  passed: boolean;
  checkedAt: string;
  modelId: string;
  issues: string[];
};

export type ReportPayload = Partial<Record<ReportFieldName, string>>;

export const REPORT_FIELD_NAMES = [
  "name",
  "email",
  "grade",
  "graduationYear",
  "school",
  "citizenship",
  "intendedMajor",
  "applicationType",
  "gpaUnweighted",
  "gpaWeighted",
  "gradingScale",
  "gradeTrend",
  "classRank",
  "courseRigor",
  "satTotal",
  "satSection",
  "actTotal",
  "englishTest",
  "testingPlan",
  "currentCourses",
  "apIbTrack",
  "apIbDetail",
  "extracurriculars",
  "awards",
  "leadership",
  "school1",
  "school1Program",
  "school1Round",
  "school2",
  "school2Program",
  "school2Round",
  "school3",
  "school3Program",
  "school3Round",
  "school4",
  "school4Program",
  "school4Round",
  "school5",
  "school5Program",
  "school5Round",
  "notes",
] as const;

export type ReportFieldName = (typeof REPORT_FIELD_NAMES)[number];
