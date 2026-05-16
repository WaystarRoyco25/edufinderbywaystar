import type {
  AdmissionReportJson,
  ApplicantProfile,
  GapFocus,
  GapLane,
  GapRecommendationItem,
  GapRecommendations,
} from "./types";

const VALID_GAP_LANES: readonly GapLane[] = [
  "extracurriculars",
  "testing",
  "essays",
  "longer_term",
];

const GAP_VERIFY_NOTE =
  "Dates and deadlines are gathered from the web and can change. Confirm every item on its official page before relying on it.";

const DAY_MS = 24 * 60 * 60 * 1000;

// The recommendation window: far enough out to leave real preparation time,
// but still close enough to act on this cycle. The prompt aims for the 2-3
// month sweet spot; these are the hard bounds the validator enforces.
export function gapDateWindow(now: Date): {
  windowStart: string;
  windowEnd: string;
} {
  return {
    windowStart: new Date(now.getTime() + 42 * DAY_MS).toISOString().slice(0, 10),
    windowEnd: new Date(now.getTime() + 130 * DAY_MS).toISOString().slice(0, 10),
  };
}

function parseGradeNumber(grade: string): number | null {
  const lower = grade.toLowerCase();
  if (lower.includes("fresh")) return 9;
  if (lower.includes("soph")) return 10;
  if (lower.includes("jun")) return 11;
  if (lower.includes("sen")) return 12;
  const digits = lower.match(/1[012]|9/);
  return digits ? Number(digits[0]) : null;
}

function isTestingTheWeakerLever(profile: ApplicantProfile): boolean {
  const plan = profile.testing.testingPlan.toLowerCase();
  if (
    plan.includes("optional") ||
    plan.includes("not submit") ||
    plan.includes("no test") ||
    plan.includes("without test")
  ) {
    return false;
  }
  return !profile.testing.satTotal.trim() && !profile.testing.actTotal.trim();
}

// Trusts the model's lane choice, but enforces the grade rule deterministically:
// building a new activity is only realistic with years of runway left.
export function resolveGapFocus(
  report: AdmissionReportJson,
  profile: ApplicantProfile,
): GapFocus {
  const raw = report.gapFocus;
  let lane: GapLane =
    raw && VALID_GAP_LANES.includes(raw.lane) ? raw.lane : "longer_term";
  let rationale =
    raw && typeof raw.rationale === "string" && raw.rationale.trim()
      ? raw.rationale.trim()
      : "We focused on the gap most likely to move your odds in the time you have left.";
  const weaknessSummary =
    raw && typeof raw.weaknessSummary === "string"
      ? raw.weaknessSummary.trim()
      : "";

  if (lane === "extracurriculars") {
    const grade = parseGradeNumber(profile.education.grade);
    const tooLateForActivities = grade === null || grade >= 11;
    if (tooLateForActivities) {
      if (isTestingTheWeakerLever(profile)) {
        lane = "testing";
        rationale =
          "With limited time before applications, lifting a test score is a faster lever than building a new activity from scratch, so we focused there.";
      } else {
        lane = "essays";
        rationale =
          "With limited time before applications, a sharper personal narrative is a faster lever than building a new activity from scratch, so we focused on the essays.";
      }
    }
  }

  return { lane, rationale, weaknessSummary };
}

export function buildStaticGapRecommendations(
  gapFocus: GapFocus,
  now: Date,
): GapRecommendations {
  if (gapFocus.lane === "essays") {
    return {
      lane: "essays",
      headline: "Your strongest remaining lever is the personal essay.",
      body: "Your grades and testing profile are largely set for this cycle, so the part of the application you can still change the most is the writing. A sharper, more specific personal narrative is what moves a borderline file. The Genius! Editor walks you through finding and shaping that story step by step.",
      items: [],
      handoffUrl: "/genius",
      verifyNote: "",
      generatedAt: now.toISOString(),
      source: "static",
    };
  }
  return {
    lane: "longer_term",
    headline: "This gap is real, but it moves slowly.",
    body: "The biggest constraint in your profile is grade point average or course rigor. Those build over full semesters and cannot change before the upcoming application round, so there is no quick fix to recommend here. The most honest move is to follow the term-by-term steps in the Action Plan and Strategy sections of this report, and to make sure your school list reflects where your record stands today.",
    items: [],
    handoffUrl: null,
    verifyNote: "",
    generatedAt: now.toISOString(),
    source: "static",
  };
}

function cleanGapItem(item: GapRecommendationItem): GapRecommendationItem | null {
  const title = item.title.trim();
  const sourceUrl = item.sourceUrl.trim();
  const eventDate = item.eventDate.trim();
  if (!title || !sourceUrl || !eventDate) return null;
  return {
    title,
    summary: item.summary.trim(),
    eventDate,
    dateKind: item.dateKind.trim() || "event",
    sourceUrl,
    eligibilityNote:
      item.eligibilityNote.trim() ||
      "Confirm eligibility for your citizenship on the official site.",
  };
}

// Best-effort enrichment: drops unverifiable items rather than failing the
// report. An empty result becomes an honest "nothing confirmed" message.
export function validateGapRecommendations(
  raw: GapRecommendations,
  gapFocus: GapFocus,
  now: Date,
): GapRecommendations {
  const { windowStart, windowEnd } = gapDateWindow(now);
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(`${windowEnd}T23:59:59.999Z`);

  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((item) => cleanGapItem(item))
    .filter((item): item is GapRecommendationItem => {
      if (!item) return false;
      const eventMs = Date.parse(item.eventDate);
      return !Number.isNaN(eventMs) && eventMs >= startMs && eventMs <= endMs;
    })
    .slice(0, 6);

  const headline =
    typeof raw.headline === "string" && raw.headline.trim()
      ? raw.headline.trim()
      : gapFocus.lane === "testing"
        ? "Upcoming exam dates that still fit this cycle."
        : "Activities that fit your major and your timeline.";

  const body =
    items.length === 0
      ? `We could not confirm ${gapFocus.lane === "testing" ? "exam dates" : "opportunities"} with verifiable official dates in your window right now. Check the official sources directly, or regenerate this report once new dates are posted.`
      : typeof raw.body === "string"
        ? raw.body.trim()
        : "";

  return {
    lane: gapFocus.lane,
    headline,
    body,
    items,
    handoffUrl: null,
    verifyNote: GAP_VERIFY_NOTE,
    generatedAt: now.toISOString(),
    source: "model",
  };
}
