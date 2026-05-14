import {
  MIN_GENIUS_SIGNAL_COUNT,
  normalizeGeniusDraftPayload,
  validateGeniusStartProfile,
} from "./intake";
import { HttpGeniusProviderClient, makeLowSignalBoard, type GeniusProviderClient } from "./provider-client";
import { validateGeniusAiBoard } from "./schema";
import type {
  GeniusAiBoard,
  GeniusModelSelection,
  GeniusSignalProfile,
  GeniusVerificationResult,
} from "./types";

export type GeniusPipelineResult = {
  status: "completed" | "needs_review";
  signalProfile: GeniusSignalProfile;
  board: GeniusAiBoard;
  verification: GeniusVerificationResult;
  modelSelection: GeniusModelSelection;
};

export type GeniusPipelineOptions = {
  providerClient?: GeniusProviderClient;
  env?: Record<string, string | undefined>;
  now?: Date;
};

function resolveGeniusModel(
  env: Record<string, string | undefined>,
  now: Date,
): GeniusModelSelection {
  return {
    provider: "gemini",
    modelId: env.GENIUS_LLM_MODEL || "gemini-3.1-pro-preview",
    thinkingLevel: "high",
    checkedAt: now.toISOString(),
  };
}

async function generateAndVerify(
  profile: GeniusSignalProfile,
  providerClient: GeniusProviderClient,
  modelSelection: GeniusModelSelection,
  now: Date,
  previousIssues?: string[],
) {
  const raw = await providerClient.generateBoard({
    profile,
    modelId: modelSelection.modelId,
    thinkingLevel: modelSelection.thinkingLevel,
    previousIssues,
  });
  return validateGeniusAiBoard(raw, profile, modelSelection.modelId, now);
}

export async function generateGeniusBoard(
  draftPayload: unknown,
  options: GeniusPipelineOptions = {},
): Promise<GeniusPipelineResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const draft = normalizeGeniusDraftPayload(draftPayload, now);
  const signalProfile = draft.signalProfile;
  const modelSelection = resolveGeniusModel(env, now);

  if (signalProfile.answeredCount < MIN_GENIUS_SIGNAL_COUNT) {
    const board = makeLowSignalBoard(signalProfile, now);
    return {
      status: "needs_review",
      signalProfile,
      board,
      verification: {
        passed: false,
        checkedAt: now.toISOString(),
        modelId: "local-low-signal",
        issues: validateGeniusStartProfile(signalProfile),
      },
      modelSelection,
    };
  }

  const providerClient = options.providerClient ?? new HttpGeniusProviderClient({ env });
  let result = await generateAndVerify(signalProfile, providerClient, modelSelection, now);

  if (!result.verification.passed) {
    result = await generateAndVerify(
      signalProfile,
      providerClient,
      modelSelection,
      now,
      result.verification.issues,
    );
  }

  return {
    status: result.verification.passed ? "completed" : "needs_review",
    signalProfile,
    board: result.board,
    verification: result.verification,
    modelSelection,
  };
}
