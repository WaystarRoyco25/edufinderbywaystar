import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApplicantProfile,
  normalizeReportPayload,
} from "../src/lib/report/intake.ts";
import { REPORT_FIELD_NAMES, type ReportPayload } from "../src/lib/report/types.ts";

test("normalizeReportPayload preserves every REPORT_FIELD_NAMES field", () => {
  const raw = Object.fromEntries(
    REPORT_FIELD_NAMES.map((field) => [field, ` ${field}-value `]),
  );
  const payload = normalizeReportPayload({
    ...raw,
    unknownField: "drop me",
    notes: " line one\r\nline two ",
  });

  for (const field of REPORT_FIELD_NAMES) {
    assert.equal(typeof payload[field], "string", `${field} should be normalized`);
  }
  assert.equal((payload as Record<string, unknown>).unknownField, undefined);
  assert.equal(payload.notes, "line one\nline two");
});

test("normalizeApplicantProfile maps target schools and core applicant fields", () => {
  const payload: ReportPayload = {
    name: "Jane Student",
    email: "jane@example.com",
    grade: "11th grade",
    graduationYear: "2027",
    school: "Seoul International School",
    citizenship: "Korean - international",
    intendedMajor: "Computer Science",
    applicationType: "First-year",
    gpaUnweighted: "3.92",
    gradingScale: "4.0",
    school1: "Stanford University",
    school1Program: "Computer Science",
    school1Round: "Regular Decision",
    school3: "University of Michigan",
    school3Program: "Engineering",
  };

  const profile = normalizeApplicantProfile(payload);

  assert.equal(profile.identity.name, "Jane Student");
  assert.equal(profile.education.currentSchool, "Seoul International School");
  assert.equal(profile.major, "Computer Science");
  assert.deepEqual(profile.targetSchools, [
    {
      index: 1,
      name: "Stanford University",
      program: "Computer Science",
      round: "Regular Decision",
    },
    {
      index: 3,
      name: "University of Michigan",
      program: "Engineering",
      round: "",
    },
  ]);
});
