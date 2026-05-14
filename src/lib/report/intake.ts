import {
  REPORT_FIELD_NAMES,
  type ApplicantProfile,
  type ReportFieldName,
  type ReportPayload,
  type TargetSchool,
} from "./types";

export const MAX_REPORT_FIELD_LENGTH = 5000;

const REPORT_FIELD_NAME_SET = new Set<string>(REPORT_FIELD_NAMES);

function normalizeFieldValue(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, MAX_REPORT_FIELD_LENGTH)
    .trim();
}

export function normalizeReportPayload(value: unknown): ReportPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const payload: ReportPayload = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!REPORT_FIELD_NAME_SET.has(key) || typeof raw !== "string") continue;
    payload[key as ReportFieldName] = normalizeFieldValue(raw);
  }
  return payload;
}

function read(payload: ReportPayload, field: ReportFieldName): string {
  return payload[field] ?? "";
}

function normalizeTargetSchools(payload: ReportPayload): TargetSchool[] {
  const schools: TargetSchool[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const name = read(payload, `school${index}` as ReportFieldName);
    const program = read(payload, `school${index}Program` as ReportFieldName);
    const round = read(payload, `school${index}Round` as ReportFieldName);

    if (!name && !program && !round) continue;
    schools.push({
      index,
      name,
      program,
      round,
    });
  }
  return schools;
}

export function normalizeApplicantProfile(value: unknown): ApplicantProfile {
  const payload = normalizeReportPayload(value);

  return {
    identity: {
      name: read(payload, "name"),
      email: read(payload, "email"),
    },
    education: {
      grade: read(payload, "grade"),
      graduationYear: read(payload, "graduationYear"),
      currentSchool: read(payload, "school"),
      citizenship: read(payload, "citizenship"),
      applicationType: read(payload, "applicationType"),
    },
    major: read(payload, "intendedMajor"),
    academics: {
      gpaUnweighted: read(payload, "gpaUnweighted"),
      gpaWeighted: read(payload, "gpaWeighted"),
      gradingScale: read(payload, "gradingScale"),
      gradeTrend: read(payload, "gradeTrend"),
      classRank: read(payload, "classRank"),
      courseRigor: read(payload, "courseRigor"),
      currentCourses: read(payload, "currentCourses"),
      apIbTrack: read(payload, "apIbTrack"),
      apIbDetail: read(payload, "apIbDetail"),
    },
    testing: {
      satTotal: read(payload, "satTotal"),
      satSection: read(payload, "satSection"),
      actTotal: read(payload, "actTotal"),
      englishTest: read(payload, "englishTest"),
      testingPlan: read(payload, "testingPlan"),
    },
    activities: {
      extracurriculars: read(payload, "extracurriculars"),
      awards: read(payload, "awards"),
      leadership: read(payload, "leadership"),
    },
    targetSchools: normalizeTargetSchools(payload),
    notes: read(payload, "notes"),
    rawFields: payload,
  };
}

export function validateReportStartProfile(profile: ApplicantProfile): string[] {
  const issues: string[] = [];

  if (!profile.identity.email.includes("@")) {
    issues.push("A valid applicant email is required.");
  }
  if (!profile.education.grade) {
    issues.push("Current grade is required.");
  }
  if (!profile.major) {
    issues.push("Intended major is required.");
  }
  if (!profile.academics.gpaUnweighted) {
    issues.push("GPA or current average is required.");
  }
  if (!profile.targetSchools.some((school) => school.name)) {
    issues.push("At least one target school is required.");
  }

  return issues;
}
