import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGeniusDraftPayload,
  stableGeniusInputHash,
  validateGeniusStartProfile,
} from "../src/lib/genius/intake.ts";

function answer(questionId: string) {
  return {
    questionId,
    type: "text",
    value: `Answer for ${questionId}`,
    labels: [`Answer for ${questionId}`],
    prompt: `Prompt ${questionId}`,
    move: "trace",
    updatedAt: "2026-05-14T00:00:00.000Z",
  };
}

test("normalizes Genius draft answers and signal profile", () => {
  const raw = {
    version: 3,
    currentIndex: 12,
    answers: {
      recurring_place: answer("recurring_place"),
      empty: { ...answer("empty"), value: "" },
    },
    reveal: {
      templateAdjustments: { "private-question": 1.3 },
      variantIndices: { "private-question": 2 },
    },
    signalProfile: {
      version: 1,
      answeredCount: 1,
      totalQuestions: 39,
      dimensions: { voice: 5 },
      topDimensions: [{ key: "voice", label: "Voice", score: 5 }],
      deterministicIdeas: [
        {
          id: "private-question",
          title: "Private Question",
          core: "A question-driven angle.",
          evidence: [{ questionId: "recurring_place", prompt: "Prompt", answer: "Answer" }],
        },
      ],
      voicePalette: [{ phrase: "A line that sounds like me.", source: "Prompt", questionId: "recurring_place" }],
      motifs: [{ word: "question", count: 2, prompts: ["Prompt"], questionIds: ["recurring_place"] }],
    },
  };

  const payload = normalizeGeniusDraftPayload(raw);
  assert.equal(Object.keys(payload.answers).length, 1);
  assert.equal(payload.signalProfile.answers.length, 1);
  assert.equal(payload.signalProfile.dimensions.voice, 5);
  assert.equal(payload.signalProfile.deterministicIdeas[0].id, "private-question");
});

test("requires enough answer-backed Genius signals before AI generation", () => {
  const payload = normalizeGeniusDraftPayload({
    answers: { one: answer("one") },
    signalProfile: { answeredCount: 1, totalQuestions: 39 },
  });

  const issues = validateGeniusStartProfile(payload.signalProfile);
  assert.ok(issues.some((issue) => issue.includes("Answer at least 11")));
});

test("stable hash changes when feedback changes", () => {
  const base = normalizeGeniusDraftPayload({
    answers: Object.fromEntries(Array.from({ length: 11 }, (_, index) => {
      const id = `answer_${index}`;
      return [id, answer(id)];
    })),
    signalProfile: {
      answeredCount: 11,
      totalQuestions: 39,
      feedback: { likedAngleIds: [], dismissedAngleIds: [], refreshedAngleIds: [], notes: "" },
    },
  });
  const liked = normalizeGeniusDraftPayload({
    ...base,
    signalProfile: {
      ...base.signalProfile,
      feedback: { likedAngleIds: ["angle-a"], dismissedAngleIds: [], refreshedAngleIds: [], notes: "" },
    },
  });

  assert.notEqual(
    stableGeniusInputHash(base.signalProfile),
    stableGeniusInputHash(liked.signalProfile),
  );
});
