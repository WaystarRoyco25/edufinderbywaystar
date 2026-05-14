import { createHash } from "node:crypto";
import type {
  GeniusAnswer,
  GeniusAnswerValue,
  GeniusBoardFeedback,
  GeniusDeterministicIdea,
  GeniusDraftPayload,
  GeniusMotif,
  GeniusSignalProfile,
  GeniusVoicePhrase,
} from "./types";

export const MIN_GENIUS_SIGNAL_COUNT = 11;
export const MAX_GENIUS_TEXT_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 12;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, max = MAX_GENIUS_TEXT_LENGTH): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function cleanId(value: unknown, fallback = ""): string {
  const clean = cleanString(value, 96).toLowerCase();
  return /^[a-z0-9_-]+$/.test(clean) ? clean : fallback;
}

function cleanStringArray(value: unknown, maxItems = MAX_ARRAY_ITEMS, maxLength = 220): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function normalizeAnswerValue(value: unknown): GeniusAnswerValue {
  if (Array.isArray(value)) return cleanStringArray(value, MAX_ARRAY_ITEMS, 240);
  return cleanString(value);
}

function answerIsFilled(answer: GeniusAnswer): boolean {
  return Array.isArray(answer.value) ? answer.value.length > 0 : answer.value.length > 0;
}

export function normalizeGeniusAnswer(
  raw: unknown,
  fallbackQuestionId = "",
): GeniusAnswer | null {
  const row = asRecord(raw);
  const questionId = cleanId(row.questionId, cleanId(fallbackQuestionId));
  if (!questionId) return null;

  const value = normalizeAnswerValue(row.value);
  const labels = cleanStringArray(row.labels, MAX_ARRAY_ITEMS, 300);
  const answer: GeniusAnswer = {
    questionId,
    type: cleanString(row.type, 40) || "text",
    value,
    labels,
    prompt: cleanString(row.prompt, 500),
    move: cleanString(row.move, 80),
    updatedAt: cleanString(row.updatedAt, 60),
  };

  return answerIsFilled(answer) ? answer : null;
}

function normalizeAnswers(value: unknown): Record<string, GeniusAnswer> {
  const rows = asRecord(value);
  const out: Record<string, GeniusAnswer> = {};
  for (const [key, rawAnswer] of Object.entries(rows)) {
    const answer = normalizeGeniusAnswer(rawAnswer, key);
    if (answer) out[answer.questionId] = answer;
  }
  return out;
}

function normalizeNumberMap(value: unknown): Record<string, number> {
  const rows = asRecord(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(rows)) {
    const cleanKey = cleanId(key);
    const num = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
    if (cleanKey && Number.isFinite(num)) out[cleanKey] = num;
  }
  return out;
}

function normalizeFeedback(value: unknown): GeniusBoardFeedback {
  const row = asRecord(value);
  return {
    likedAngleIds: cleanStringArray(row.likedAngleIds, 20, 120),
    dismissedAngleIds: cleanStringArray(row.dismissedAngleIds, 20, 120),
    refreshedAngleIds: cleanStringArray(row.refreshedAngleIds, 50, 120),
    notes: cleanString(row.notes, 1000),
  };
}

function normalizeEvidenceItems(value: unknown): GeniusDeterministicIdea["evidence"] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const row = asRecord(item);
          const questionId = cleanId(row.questionId);
          if (!questionId) return null;
          return {
            questionId,
            prompt: cleanString(row.prompt, 500),
            answer: cleanString(row.answer, 500),
          };
        })
        .filter((item): item is GeniusDeterministicIdea["evidence"][number] => Boolean(item))
        .slice(0, 4)
    : [];
}

function normalizeDeterministicIdeas(value: unknown): GeniusDeterministicIdea[] {
  return Array.isArray(value)
    ? value
        .map((item, index) => {
          const row = asRecord(item);
          const id = cleanId(row.id, `idea-${index + 1}`);
          return {
            id,
            rank: Number.isInteger(row.rank) ? Number(row.rank) : index + 1,
            title: cleanString(row.title, 160),
            score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0,
            core: cleanString(row.core, 700),
            tension: cleanString(row.tension, 700),
            opening: cleanString(row.opening, 700),
            distinctive: cleanString(row.distinctive, 700),
            evidence: normalizeEvidenceItems(row.evidence),
            essayTypes: cleanStringArray(row.essayTypes, 8, 80),
            adjustment:
              typeof row.adjustment === "number" && Number.isFinite(row.adjustment)
                ? row.adjustment
                : 1,
            variantIndex: Number.isInteger(row.variantIndex) ? Number(row.variantIndex) : 0,
          };
        })
        .slice(0, 8)
    : [];
}

function normalizeVoicePalette(value: unknown): GeniusVoicePhrase[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const row = asRecord(item);
          const phrase = cleanString(row.phrase, 400);
          if (!phrase) return null;
          return {
            phrase,
            source: cleanString(row.source, 500),
            questionId: cleanId(row.questionId),
          };
        })
        .filter((item): item is GeniusVoicePhrase => Boolean(item))
        .slice(0, 8)
    : [];
}

function normalizeMotifs(value: unknown): GeniusMotif[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const row = asRecord(item);
          const word = cleanString(row.word, 80).toLowerCase();
          if (!word) return null;
          return {
            word,
            count: typeof row.count === "number" && Number.isFinite(row.count) ? row.count : 1,
            prompts: cleanStringArray(row.prompts, 5, 500),
            questionIds: cleanStringArray(row.questionIds, 8, 96),
          };
        })
        .filter((item): item is GeniusMotif => Boolean(item))
        .slice(0, 10)
    : [];
}

function answerText(answer: GeniusAnswer): string {
  if (answer.labels.length) return answer.labels.join(", ");
  return Array.isArray(answer.value) ? answer.value.join(", ") : answer.value;
}

export function buildMinimalSignalProfile(
  answers: Record<string, GeniusAnswer>,
  now = new Date(),
): GeniusSignalProfile {
  const answerRows = Object.values(answers);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    answeredCount: answerRows.length,
    totalQuestions: Math.max(answerRows.length, 39),
    dimensions: {},
    topDimensions: [],
    answers: answerRows,
    deterministicIdeas: [],
    voicePalette: answerRows
      .filter((answer) => !Array.isArray(answer.value) && answerText(answer).split(/\s+/).length >= 4)
      .slice(0, 6)
      .map((answer) => ({
        phrase: answerText(answer),
        source: answer.prompt,
        questionId: answer.questionId,
      })),
    motifs: [],
    feedback: {
      likedAngleIds: [],
      dismissedAngleIds: [],
      refreshedAngleIds: [],
      notes: "",
    },
  };
}

export function normalizeGeniusSignalProfile(
  value: unknown,
  answers: Record<string, GeniusAnswer>,
  now = new Date(),
): GeniusSignalProfile {
  const fallback = buildMinimalSignalProfile(answers, now);
  const row = asRecord(value);
  const rawTopDimensions = Array.isArray(row.topDimensions) ? row.topDimensions : [];
  const topDimensions = rawTopDimensions
    .map((item) => {
      const dimension = asRecord(item);
      const key = cleanId(dimension.key);
      if (!key) return null;
      const score =
        typeof dimension.score === "number" && Number.isFinite(dimension.score)
          ? dimension.score
          : Number(dimension.score);
      return {
        key,
        label: cleanString(dimension.label, 120),
        score: Number.isFinite(score) ? score : 0,
      };
    })
    .filter((item): item is GeniusSignalProfile["topDimensions"][number] => Boolean(item))
    .slice(0, 8);

  return {
    version: 1,
    generatedAt: cleanString(row.generatedAt, 60) || fallback.generatedAt,
    answeredCount:
      typeof row.answeredCount === "number" && Number.isFinite(row.answeredCount)
        ? Math.max(0, Math.min(39, Math.round(row.answeredCount)))
        : fallback.answeredCount,
    totalQuestions:
      typeof row.totalQuestions === "number" && Number.isFinite(row.totalQuestions)
        ? Math.max(39, Math.round(row.totalQuestions))
        : fallback.totalQuestions,
    dimensions: normalizeNumberMap(row.dimensions),
    topDimensions,
    answers: Object.values(answers),
    deterministicIdeas: normalizeDeterministicIdeas(row.deterministicIdeas),
    voicePalette: normalizeVoicePalette(row.voicePalette),
    motifs: normalizeMotifs(row.motifs),
    feedback: normalizeFeedback(row.feedback),
  };
}

export function normalizeGeniusDraftPayload(
  value: unknown,
  now = new Date(),
): GeniusDraftPayload {
  const row = asRecord(value);
  const answers = normalizeAnswers(row.answers);
  const reveal = asRecord(row.reveal);
  return {
    version:
      typeof row.version === "number" && Number.isFinite(row.version)
        ? Math.max(1, Math.round(row.version))
        : 1,
    currentIndex:
      typeof row.currentIndex === "number" && Number.isFinite(row.currentIndex)
        ? Math.max(0, Math.min(39, Math.round(row.currentIndex)))
        : 0,
    answers,
    reveal: {
      templateAdjustments: normalizeNumberMap(reveal.templateAdjustments),
      variantIndices: normalizeNumberMap(reveal.variantIndices),
    },
    signalProfile: normalizeGeniusSignalProfile(row.signalProfile, answers, now),
  };
}

export function validateGeniusStartProfile(profile: GeniusSignalProfile): string[] {
  const issues: string[] = [];
  if (profile.answeredCount < MIN_GENIUS_SIGNAL_COUNT) {
    issues.push(
      `Answer at least ${MIN_GENIUS_SIGNAL_COUNT} Genius signals before generating an AI board.`,
    );
  }
  if (profile.answers.length < MIN_GENIUS_SIGNAL_COUNT) {
    issues.push("The saved draft does not include enough answer evidence.");
  }
  return issues;
}

export function stableGeniusInputHash(profile: GeniusSignalProfile): string {
  const payload = {
    answers: profile.answers.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
      labels: answer.labels,
      prompt: answer.prompt,
      move: answer.move,
    })),
    dimensions: profile.dimensions,
    deterministicIdeas: profile.deterministicIdeas.map((idea) => ({
      id: idea.id,
      adjustment: idea.adjustment,
      variantIndex: idea.variantIndex,
    })),
    feedback: profile.feedback,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
