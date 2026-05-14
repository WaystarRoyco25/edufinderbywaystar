export type GeniusBoardStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review";

export type GeniusAnswerValue = string | string[];

export type GeniusAnswer = {
  questionId: string;
  type: string;
  value: GeniusAnswerValue;
  labels: string[];
  prompt: string;
  move: string;
  updatedAt: string;
};

export type GeniusEvidenceItem = {
  questionId: string;
  prompt: string;
  answer: string;
};

export type GeniusDeterministicIdea = {
  id: string;
  rank: number;
  title: string;
  score: number;
  core: string;
  tension: string;
  opening: string;
  distinctive: string;
  evidence: GeniusEvidenceItem[];
  essayTypes: string[];
  adjustment: number;
  variantIndex: number;
};

export type GeniusVoicePhrase = {
  phrase: string;
  source: string;
  questionId: string;
};

export type GeniusMotif = {
  word: string;
  count: number;
  prompts: string[];
  questionIds: string[];
};

export type GeniusBoardFeedback = {
  likedAngleIds: string[];
  dismissedAngleIds: string[];
  refreshedAngleIds: string[];
  notes: string;
};

export type GeniusSignalProfile = {
  version: 1;
  generatedAt: string;
  answeredCount: number;
  totalQuestions: number;
  dimensions: Record<string, number>;
  topDimensions: Array<{
    key: string;
    label: string;
    score: number;
  }>;
  answers: GeniusAnswer[];
  deterministicIdeas: GeniusDeterministicIdea[];
  voicePalette: GeniusVoicePhrase[];
  motifs: GeniusMotif[];
  feedback: GeniusBoardFeedback;
};

export type GeniusDraftPayload = {
  version: number;
  currentIndex: number;
  answers: Record<string, GeniusAnswer>;
  reveal: {
    templateAdjustments: Record<string, number>;
    variantIndices: Record<string, number>;
  };
  signalProfile: GeniusSignalProfile;
};

export type GeniusAiAngle = {
  id: string;
  title: string;
  core: string;
  hiddenTension: string;
  openingScene: string;
  whyItIsYours: string;
  evidenceAnswerIds: string[];
  coachingMoves: string[];
  avoid: string[];
  tags: string[];
};

export type GeniusAiBoard = {
  version: 1;
  generatedAt: string;
  readiness: {
    status: "ready" | "needs_more_signal";
    answeredCount: number;
    totalQuestions: number;
    summary: string;
  };
  angles: GeniusAiAngle[];
  voicePalette: Array<{
    phrase: string;
    whyItMatters: string;
    sourceAnswerIds: string[];
  }>;
  motifs: Array<{
    motif: string;
    interpretation: string;
    sourceAnswerIds: string[];
  }>;
  discardPile: Array<{
    title: string;
    reason: string;
    sourceAnswerIds: string[];
  }>;
  followUpQuestions: Array<{
    question: string;
    purpose: string;
    sourceAnswerIds: string[];
  }>;
  nextWritingMoves: string[];
  safetyNotes: string[];
};

export type GeniusVerificationResult = {
  passed: boolean;
  checkedAt: string;
  modelId: string;
  issues: string[];
};

export type GeniusModelSelection = {
  provider: "gemini";
  modelId: string;
  thinkingLevel: "high";
  checkedAt: string;
};
