import type {
  GeniusAiAngle,
  GeniusAiBoard,
  GeniusSignalProfile,
  GeniusVerificationResult,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, max = 900): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function cleanStringArray(value: unknown, maxItems: number, maxLength = 260): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function validateCitations(
  value: unknown,
  answeredIds: Set<string>,
  issues: string[],
  owner: string,
  min = 1,
  max = 4,
): string[] {
  const ids = cleanStringArray(value, max, 96);
  const unique = Array.from(new Set(ids));
  if (unique.length < min) {
    issues.push(`${owner} must cite at least ${min} answer ID${min === 1 ? "" : "s"}.`);
  }
  for (const id of unique) {
    if (!answeredIds.has(id)) issues.push(`${owner} cites unknown answer ID ${id}.`);
  }
  return unique;
}

function normalizeAngle(
  value: unknown,
  index: number,
  answeredIds: Set<string>,
  issues: string[],
): GeniusAiAngle | null {
  const row = asRecord(value);
  const title = cleanString(row.title, 160);
  const core = cleanString(row.core, 700);
  const evidenceAnswerIds = validateCitations(
    row.evidenceAnswerIds,
    answeredIds,
    issues,
    title || `Angle ${index + 1}`,
    2,
    4,
  );

  if (!title || !core) {
    issues.push(`Angle ${index + 1} is missing a title or core.`);
    return null;
  }

  return {
    id: cleanString(row.id, 120) || `ai-angle-${index + 1}`,
    title,
    core,
    hiddenTension: cleanString(row.hiddenTension, 700),
    openingScene: cleanString(row.openingScene, 700),
    whyItIsYours: cleanString(row.whyItIsYours, 700),
    evidenceAnswerIds,
    coachingMoves: cleanStringArray(row.coachingMoves, 5, 360),
    avoid: cleanStringArray(row.avoid, 5, 300),
    tags: cleanStringArray(row.tags, 8, 80),
  };
}

function normalizeCitationObjects(
  value: unknown,
  answeredIds: Set<string>,
  issues: string[],
  fields: { text: string; explanation: string; citations: string },
  owner: string,
  limit: number,
) {
  return Array.isArray(value)
    ? value
        .map((item, index) => {
          const row = asRecord(item);
          const text = cleanString(row[fields.text], 360);
          if (!text) return null;
          return {
            [fields.text]: text,
            [fields.explanation]: cleanString(row[fields.explanation], 500),
            [fields.citations]: validateCitations(
              row[fields.citations],
              answeredIds,
              issues,
              `${owner} ${index + 1}`,
              1,
              4,
            ),
          };
        })
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

export function validateGeniusAiBoard(
  value: unknown,
  profile: GeniusSignalProfile,
  modelId: string,
  now = new Date(),
): { board: GeniusAiBoard; verification: GeniusVerificationResult } {
  const issues: string[] = [];
  const row = asRecord(value);
  const answeredIds = new Set(profile.answers.map((answer) => answer.questionId));
  const readinessRow = asRecord(row.readiness);
  const rawAngles = Array.isArray(row.angles) ? row.angles : [];
  const angles = rawAngles
    .map((item, index) => normalizeAngle(item, index, answeredIds, issues))
    .filter((item): item is GeniusAiAngle => Boolean(item))
    .slice(0, 5);

  if (profile.answeredCount >= 11 && (angles.length < 3 || angles.length > 5)) {
    issues.push("Ready AI boards must include 3 to 5 grounded angles.");
  }

  const board: GeniusAiBoard = {
    version: 1,
    generatedAt: cleanString(row.generatedAt, 60) || now.toISOString(),
    readiness: {
      status: readinessRow.status === "needs_more_signal" ? "needs_more_signal" : "ready",
      answeredCount: profile.answeredCount,
      totalQuestions: profile.totalQuestions,
      summary: cleanString(readinessRow.summary, 700),
    },
    angles,
    voicePalette: normalizeCitationObjects(
      row.voicePalette,
      answeredIds,
      issues,
      { text: "phrase", explanation: "whyItMatters", citations: "sourceAnswerIds" },
      "Voice phrase",
      8,
    ) as GeniusAiBoard["voicePalette"],
    motifs: normalizeCitationObjects(
      row.motifs,
      answeredIds,
      issues,
      { text: "motif", explanation: "interpretation", citations: "sourceAnswerIds" },
      "Motif",
      8,
    ) as GeniusAiBoard["motifs"],
    discardPile: normalizeCitationObjects(
      row.discardPile,
      answeredIds,
      issues,
      { text: "title", explanation: "reason", citations: "sourceAnswerIds" },
      "Discard item",
      6,
    ) as GeniusAiBoard["discardPile"],
    followUpQuestions: normalizeCitationObjects(
      row.followUpQuestions,
      answeredIds,
      issues,
      { text: "question", explanation: "purpose", citations: "sourceAnswerIds" },
      "Follow-up question",
      8,
    ) as GeniusAiBoard["followUpQuestions"],
    nextWritingMoves: cleanStringArray(row.nextWritingMoves, 8, 360),
    safetyNotes: cleanStringArray(row.safetyNotes, 6, 360),
  };

  return {
    board,
    verification: {
      passed: issues.length === 0,
      checkedAt: now.toISOString(),
      modelId,
      issues,
    },
  };
}
