import test from "node:test";
import assert from "node:assert/strict";
import { generateGeniusBoard } from "../src/lib/genius/pipeline.ts";
import {
  HttpGeniusProviderClient,
  type GeniusProviderClient,
} from "../src/lib/genius/provider-client.ts";
import type { GeniusSignalProfile } from "../src/lib/genius/types.ts";

const NOW = new Date("2026-05-14T00:00:00.000Z");

function answer(questionId: string) {
  return {
    questionId,
    type: "text",
    value: `Specific answer ${questionId}`,
    labels: [`Specific answer ${questionId}`],
    prompt: `Prompt ${questionId}`,
    move: "trace",
    updatedAt: NOW.toISOString(),
  };
}

function payload(answerCount = 11) {
  const answers = Object.fromEntries(
    Array.from({ length: answerCount }, (_, index) => {
      const id = `answer_${index}`;
      return [id, answer(id)];
    }),
  );
  return {
    version: 3,
    currentIndex: answerCount,
    answers,
    reveal: { templateAdjustments: {}, variantIndices: {} },
    signalProfile: {
      version: 1,
      generatedAt: NOW.toISOString(),
      answeredCount: answerCount,
      totalQuestions: 39,
      dimensions: { voice: 8, tension: 6 },
      topDimensions: [{ key: "voice", label: "Voice", score: 8 }],
      answers: Object.values(answers),
      deterministicIdeas: [],
      voicePalette: [],
      motifs: [],
      feedback: { likedAngleIds: [], dismissedAngleIds: [], refreshedAngleIds: [], notes: "" },
    },
  };
}

class MockProvider implements GeniusProviderClient {
  readonly mode: "valid" | "bad-citation" | "retry";
  calls = 0;

  constructor(mode: "valid" | "bad-citation" | "retry" = "valid") {
    this.mode = mode;
  }

  async generateBoard({ profile, previousIssues }: { profile: GeniusSignalProfile; previousIssues?: string[] }) {
    this.calls += 1;
    if (this.mode === "retry" && !previousIssues?.length) {
      return this.board(profile, ["missing_id"]);
    }
    if (this.mode === "bad-citation") return this.board(profile, ["missing_id"]);
    return this.board(profile, ["answer_0", "answer_1"]);
  }

  private board(profile: GeniusSignalProfile, citations: string[]) {
    const angle = (id: string) => ({
      id,
      title: `Angle ${id}`,
      core: "A grounded coaching angle.",
      hiddenTension: "A specific tension.",
      openingScene: "Start with a concrete scene.",
      whyItIsYours: "It cites the student's own answers.",
      evidenceAnswerIds: citations,
      coachingMoves: ["Write 100 words from the scene."],
      avoid: ["Do not summarize the resume."],
      tags: ["grounded"],
    });
    return {
      version: 1,
      generatedAt: NOW.toISOString(),
      readiness: {
        status: "ready",
        answeredCount: profile.answeredCount,
        totalQuestions: profile.totalQuestions,
        summary: "Ready.",
      },
      angles: [angle("a"), angle("b"), angle("c")],
      voicePalette: [{ phrase: "Specific answer answer_0", whyItMatters: "It sounds personal.", sourceAnswerIds: ["answer_0"] }],
      motifs: [{ motif: "specific", interpretation: "Repeated concrete language.", sourceAnswerIds: ["answer_0"] }],
      discardPile: [{ title: "Generic activity list", reason: "It hides the story.", sourceAnswerIds: ["answer_0"] }],
      followUpQuestions: [{ question: "What happened next?", purpose: "Adds scene motion.", sourceAnswerIds: ["answer_1"] }],
      nextWritingMoves: ["Draft a scene fragment."],
      safetyNotes: ["Use only true details."],
    };
  }
}

test("generates a completed Genius board with valid answer citations", async () => {
  const provider = new MockProvider("valid");
  const result = await generateGeniusBoard(payload(), {
    providerClient: provider,
    now: NOW,
    env: { GENIUS_LLM_MODEL: "gemini-3.1-pro-preview" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.board.angles.length, 3);
  assert.equal(result.modelSelection.modelId, "gemini-3.1-pro-preview");
  assert.equal(result.modelSelection.thinkingLevel, "high");
  assert.equal(provider.calls, 1);
});

test("Gemini HTTP client requests high thinking level", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ version: 1 }) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const client = new HttpGeniusProviderClient({
    env: { GEMINI_API_KEY: "test-key" },
    fetchImpl,
  });

  await client.generateBoard({
    profile: payload().signalProfile,
    modelId: "gemini-3.1-pro-preview",
    thinkingLevel: "high",
  });

  assert.deepEqual(
    (requestBody?.generationConfig as { thinkingConfig?: unknown } | undefined)?.thinkingConfig,
    { thinkingLevel: "high" },
  );
});

test("retries once and marks needs_review if citations remain invalid", async () => {
  const provider = new MockProvider("bad-citation");
  const result = await generateGeniusBoard(payload(), {
    providerClient: provider,
    now: NOW,
    env: { GENIUS_LLM_MODEL: "gemini-3.1-pro-preview" },
  });

  assert.equal(result.status, "needs_review");
  assert.equal(provider.calls, 2);
  assert.ok(result.verification.issues.some((issue) => issue.includes("unknown answer ID")));
});

test("retry can repair invalid first output", async () => {
  const provider = new MockProvider("retry");
  const result = await generateGeniusBoard(payload(), {
    providerClient: provider,
    now: NOW,
    env: { GENIUS_LLM_MODEL: "gemini-3.1-pro-preview" },
  });

  assert.equal(result.status, "completed");
  assert.equal(provider.calls, 2);
});

test("low-signal drafts do not call the provider", async () => {
  const provider = new MockProvider("valid");
  const result = await generateGeniusBoard(payload(3), {
    providerClient: provider,
    now: NOW,
    env: { GENIUS_LLM_MODEL: "gemini-3.1-pro-preview" },
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.board.readiness.status, "needs_more_signal");
  assert.equal(provider.calls, 0);
});
