import test from "node:test";
import assert from "node:assert/strict";
import { generateAdmissionReport } from "../src/lib/report/pipeline.ts";
import type {
  AdmissionReportJson,
  ApplicantProfile,
  EvidenceCase,
  GapLane,
  GapRecommendations,
  ModelProvider,
  SourceType,
  TargetSchool,
} from "../src/lib/report/types.ts";
import type {
  DraftReportInput,
  FixReportIssuesInput,
  GapRecommendationsInput,
  ReportProviderClient,
  ReviewReportInput,
} from "../src/lib/report/provider-client.ts";

const NOW = new Date("2026-05-02T00:00:00.000Z");

const payload = {
  name: "Jane Student",
  email: "jane@example.com",
  grade: "11th grade",
  school: "Seoul International School",
  citizenship: "Korean - international",
  intendedMajor: "Computer Science",
  gpaUnweighted: "3.92",
  gradingScale: "4.0",
  courseRigor: "Most rigorous",
  extracurriculars: "Robotics captain",
  awards: "Regional science fair",
  leadership: "Club founder",
  school1: "Stanford University",
  school1Program: "Computer Science",
  school1Round: "Regular Decision",
};

const tenthGraderPayload = { ...payload, grade: "10th grade" };
const twelfthGraderPayload = { ...payload, grade: "12th grade" };

function evidence(
  id: string,
  sourceType: SourceType,
  school: string,
  quoteExcerpt: string,
): EvidenceCase {
  return {
    id,
    sourceType,
    school,
    cycle: "2025",
    outcome: sourceType === "google" ? "stat" : "accepted",
    round: "RD",
    program: "Computer Science",
    applicantFacts: { gpa: "3.9" },
    quoteExcerpt,
    url: sourceType === "reddit"
      ? `https://www.reddit.com/r/ApplyingToCollege/${id}`
      : sourceType === "x"
        ? `https://x.com/${id}`
        : `https://example.com/${id}`,
    retrievedAt: NOW.toISOString(),
    credibilityScore: sourceType === "google" ? 0.9 : 0.7,
    modelId: sourceType === "x" ? "grok-4.3" : "gemini-3.1-pro-preview",
  };
}

function makeReport(args: {
  profile: ApplicantProfile;
  evidence: EvidenceCase[];
  alterQuote?: boolean;
  confidence?: "high" | "medium" | "low";
  gapLane?: GapLane;
}): AdmissionReportJson {
  const school = args.profile.targetSchools[0];
  const googleSource = args.evidence.find((item) => item.sourceType === "google");
  const social = args.evidence.find((item) => item.sourceType !== "google");
  const similarCases = social
    ? [
        {
          evidenceId: social.id,
          sourceType: social.sourceType,
          outcome: social.outcome,
          summary: "A comparable applicant with a similar profile and outcome.",
          quoteExcerpt: args.alterQuote ? "changed quote" : social.quoteExcerpt,
          url: social.url,
        },
      ]
    : [];

  return {
    version: 1,
    generatedAt: NOW.toISOString(),
    executiveSnapshot: [
      {
        school: school.name,
        chanceBand: "Reach",
        confidence: args.confidence ?? "high",
        strongestFactor: "Rigor aligns with the target program.",
        biggestConcern: "Ultra-selective admit rate.",
        evidenceIds: args.evidence.map((item) => item.id),
      },
    ],
    applicantRead: {
      academics: "Strong grades in a rigorous context.",
      testing: "Testing context is incomplete.",
      curriculum: "Course rigor is a strength.",
      activities: "Robotics shows major alignment.",
      awards: "Awards add external validation.",
      leadership: "Leadership is clear.",
      context: "International applicant context matters.",
    },
    schools: [
      {
        school: school.name,
        program: school.program,
        round: school.round,
        chanceBand: "Reach",
        confidence: args.confidence ?? "high",
        officialBaseline: {
          admitRatePercent: googleSource ? 4 : null,
          middle50Sat: googleSource ? "1500-1570" : "",
          middle50Act: "",
          notes: googleSource ? googleSource.quoteExcerpt : "Official stats unavailable.",
          evidenceIds: googleSource ? [googleSource.id] : [],
        },
        studentFit: "Academic fit is strong, but selectivity remains high.",
        similarCases,
        reasons: ["The band is supported by official stats and public cases."],
        actions: ["Confirm testing plan and add school-specific essays."],
      },
    ],
    strategy: {
      schoolListBalance: "Add more target and likely options.",
      earlyRoundGuidance: "Use early applications carefully.",
      riskNotes: ["Anecdotal public cases are not predictive by themselves."],
    },
    actionPlan: {
      next30Days: ["Finalize testing plan."],
      next90Days: ["Draft school-specific essays."],
      applicationSeason: ["Keep the list balanced."],
    },
    evidenceAppendix: args.evidence.map((item) => ({
      evidenceId: item.id,
      sourceType: item.sourceType,
      school: item.school,
      url: item.url,
      retrievedAt: item.retrievedAt,
      quoteExcerpt: item.quoteExcerpt,
    })),
    gapFocus: {
      lane: args.gapLane ?? "essays",
      rationale: "Mock gap rationale.",
      weaknessSummary: "Mock weakness summary.",
    },
  };
}

type MockOptions = {
  evidenceMode?: "full" | "none";
  alterQuote?: boolean;
  fixerRepairs?: boolean;
  reviewIssues?: string[];
  gapLane?: GapLane;
  gapItemsMode?: "valid" | "stale" | "noUrl" | "empty";
  gapThrows?: boolean;
};

class MockProvider implements ReportProviderClient {
  fixerCalls = 0;
  draftCalls = 0;
  reviewCalls = 0;
  gapCalls = 0;
  protected readonly options: MockOptions;

  constructor(options: MockOptions = {}) {
    this.options = options;
  }

  async listModels(provider: ModelProvider) {
    const models: Record<ModelProvider, string[]> = {
      gemini: ["gemini-3.1-pro-preview"],
      xai: ["grok-4.3"],
    };
    return { checked: true, models: models[provider], reason: null };
  }

  async collectXEvidence({ school }: { school: TargetSchool }) {
    if (this.options.evidenceMode === "none") return [];
    return [
      evidence(
        "x-stanford-1",
        "x",
        school.name,
        "Accepted CS with robotics leadership and a 3.9 GPA.",
      ),
    ];
  }

  async collectGoogleAndRedditEvidence({ school }: { school: TargetSchool }) {
    if (this.options.evidenceMode === "none") return [];
    return [
      evidence(
        "google-stanford-1",
        "google",
        school.name,
        "Stanford reports a first-year admit rate under five percent.",
      ),
      evidence(
        "reddit-stanford-1",
        "reddit",
        school.name,
        "Reddit thread: admitted with 3.9 UW and strong robotics resume.",
      ),
    ];
  }

  async draftReport(args: DraftReportInput & { modelId: string }) {
    this.draftCalls += 1;
    assert.equal(args.modelId, "gemini-3.1-pro-preview");
    return makeReport({
      profile: args.profile,
      evidence: args.evidence,
      alterQuote: this.options.alterQuote,
      confidence: "high",
      gapLane: this.options.gapLane,
    });
  }

  async fixReportIssues(args: FixReportIssuesInput & { modelId: string }) {
    this.fixerCalls += 1;
    assert.equal(args.modelId, "grok-4.3");
    return makeReport({
      profile: args.profile,
      evidence: args.evidence,
      alterQuote: this.options.fixerRepairs ? false : this.options.alterQuote,
      confidence: "high",
      gapLane: this.options.gapLane,
    });
  }

  async reviewReport(args: ReviewReportInput & { modelId: string }) {
    this.reviewCalls += 1;
    assert.equal(args.modelId, "grok-4.3");
    const issues = this.options.reviewIssues ?? [];
    return { makesSense: issues.length === 0, issues };
  }

  async collectGapRecommendations(
    args: GapRecommendationsInput & { modelId: string },
  ): Promise<GapRecommendations> {
    this.gapCalls += 1;
    assert.equal(args.modelId, "gemini-3.1-pro-preview");
    if (this.options.gapThrows) {
      throw new Error("mock gap recommendation failure");
    }
    const mode = this.options.gapItemsMode ?? "valid";
    const items =
      mode === "empty"
        ? []
        : [
            {
              title: "Mock STEM Challenge",
              summary: "A national competition aligned with the major.",
              eventDate: mode === "stale" ? "2026-01-10" : "2026-08-15",
              dateKind: "event",
              sourceUrl:
                mode === "noUrl" ? "" : "https://example.org/stem-challenge",
              eligibilityNote: "Open to international applicants.",
            },
          ];
    return {
      lane: args.gapFocus.lane,
      headline: "Mock recommendations",
      body: "Mock body.",
      items,
      handoffUrl: null,
      verifyNote: "",
      generatedAt: args.now.toISOString(),
      source: "model",
    };
  }
}

test("pipeline uses Gemini drafting and Grok X search, returns verified report", async () => {
  const provider = new MockProvider();
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.modelSelections.xEvidence.modelId, "grok-4.3");
  assert.equal(result.modelSelections.googleEvidence.modelId, "gemini-3.1-pro-preview");
  assert.equal(result.modelSelections.drafting.modelId, "gemini-3.1-pro-preview");
  assert.equal(result.report.schools[0].confidence, "high");
  assert.equal(provider.fixerCalls, 0);
  assert.equal(provider.draftCalls, 1);
  assert.equal(provider.reviewCalls, 1, "Grok always reviews the draft");
});

test("pipeline lowers confidence when evidence sources are missing", async () => {
  const result = await generateAdmissionReport(payload, {
    providerClient: new MockProvider({ evidenceMode: "none" }),
    now: NOW,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.report.schools[0].confidence, "low");
  assert.match(result.report.schools[0].reasons.join(" "), /Confidence lowered/);
});

test("altered quote triggers Grok fixer; still failing after fix yields needs_review", async () => {
  const provider = new MockProvider({ alterQuote: true });
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  assert.equal(provider.fixerCalls, 1);
  assert.equal(result.status, "needs_review");
  assert.equal(result.verification.passed, false);
  assert.match(result.verification.issues.join(" "), /does not match stored excerpt/);
  assert.match(result.verification.modelId, /grok-4\.3\+local/);
});

test("Grok fixer repairs the issue and produces a completed report", async () => {
  const provider = new MockProvider({ alterQuote: true, fixerRepairs: true });
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  assert.equal(provider.fixerCalls, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.verification.passed, true);
});

test("Grok review feeds plausibility issues into the fixer", async () => {
  const provider = new MockProvider({
    reviewIssues: ["Stanford's chance band looks too optimistic for this GPA."],
  });
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  assert.equal(provider.reviewCalls, 1);
  assert.equal(provider.fixerCalls, 1, "review issues should trigger one fix pass");
  assert.equal(result.status, "completed");
});

test("evidence collection fans out across schools in parallel", async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  const release = new Promise<void>((resolve) => setTimeout(resolve, 50));

  class ParallelMock extends MockProvider {
    async collectXEvidence(args: { school: TargetSchool }) {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await release;
      inFlight -= 1;
      return super.collectXEvidence(args);
    }
    async collectGoogleAndRedditEvidence(args: { school: TargetSchool }) {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await release;
      inFlight -= 1;
      return super.collectGoogleAndRedditEvidence(args);
    }
  }

  const multiSchoolPayload = {
    ...payload,
    school1: "Stanford University",
    school1Program: "Computer Science",
    school1Round: "Regular Decision",
    school2: "MIT",
    school2Program: "Computer Science",
    school2Round: "Regular Decision",
    school3: "Carnegie Mellon University",
    school3Program: "Computer Science",
    school3Round: "Regular Decision",
  };

  await generateAdmissionReport(multiSchoolPayload, {
    providerClient: new ParallelMock(),
    now: NOW,
  });

  assert.equal(peakInFlight, 6, "all 6 evidence calls should be in flight simultaneously");
});

test("extracurriculars lane returns dated, sourced items for a younger student", async () => {
  const provider = new MockProvider({
    gapLane: "extracurriculars",
    gapItemsMode: "valid",
  });
  const result = await generateAdmissionReport(tenthGraderPayload, {
    providerClient: provider,
    now: NOW,
  });

  assert.equal(result.report.gapFocus?.lane, "extracurriculars");
  const gap = result.report.gapRecommendations;
  assert(gap, "expected gap recommendations to be attached");
  assert.equal(gap.lane, "extracurriculars");
  assert.equal(gap.items.length, 1);
  assert.ok(gap.items[0].sourceUrl, "item should carry an official source url");
  assert.ok(gap.items[0].eligibilityNote, "item should carry an eligibility note");
  assert.equal(provider.gapCalls, 1);
});

test("grade rule downgrades extracurriculars for a 12th grader", async () => {
  const result = await generateAdmissionReport(twelfthGraderPayload, {
    providerClient: new MockProvider({ gapLane: "extracurriculars" }),
    now: NOW,
  });

  assert.notEqual(result.report.gapFocus?.lane, "extracurriculars");
  assert.equal(result.report.gapFocus?.lane, "testing");
});

test("gap items dated outside the window are dropped", async () => {
  const result = await generateAdmissionReport(tenthGraderPayload, {
    providerClient: new MockProvider({
      gapLane: "extracurriculars",
      gapItemsMode: "stale",
    }),
    now: NOW,
  });

  const gap = result.report.gapRecommendations;
  assert(gap, "expected gap recommendations to be attached");
  assert.equal(gap.items.length, 0);
});

test("gap items without an official source url are dropped", async () => {
  const result = await generateAdmissionReport(tenthGraderPayload, {
    providerClient: new MockProvider({
      gapLane: "extracurriculars",
      gapItemsMode: "noUrl",
    }),
    now: NOW,
  });

  const gap = result.report.gapRecommendations;
  assert(gap, "expected gap recommendations to be attached");
  assert.equal(gap.items.length, 0);
});

test("essays lane produces a static handoff with no search call", async () => {
  const provider = new MockProvider({ gapLane: "essays" });
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  const gap = result.report.gapRecommendations;
  assert(gap, "expected gap recommendations to be attached");
  assert.equal(gap.source, "static");
  assert.equal(gap.lane, "essays");
  assert.equal(gap.handoffUrl, "/genius");
  assert.equal(gap.items.length, 0);
  assert.equal(provider.gapCalls, 0);
});

test("longer_term lane produces static framing with no search call", async () => {
  const provider = new MockProvider({ gapLane: "longer_term" });
  const result = await generateAdmissionReport(payload, {
    providerClient: provider,
    now: NOW,
  });

  const gap = result.report.gapRecommendations;
  assert(gap, "expected gap recommendations to be attached");
  assert.equal(gap.source, "static");
  assert.equal(gap.lane, "longer_term");
  assert.equal(gap.handoffUrl, null);
  assert.ok(gap.body.length > 0);
  assert.equal(provider.gapCalls, 0);
});

test("a gap recommendation failure does not demote the report", async () => {
  const result = await generateAdmissionReport(tenthGraderPayload, {
    providerClient: new MockProvider({
      gapLane: "extracurriculars",
      gapThrows: true,
    }),
    now: NOW,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.report.gapRecommendations, undefined);
  assert.equal(result.report.gapFocus?.lane, "extracurriculars");
});
