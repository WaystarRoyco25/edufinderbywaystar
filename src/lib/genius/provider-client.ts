import type { GeniusAiBoard, GeniusSignalProfile } from "./types";

export type GeniusProviderClient = {
  generateBoard(args: {
    profile: GeniusSignalProfile;
    modelId: string;
    thinkingLevel: "high";
    previousIssues?: string[];
  }): Promise<unknown>;
};

type HttpClientOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseJsonFromText(text: string): unknown {
  try {
    return JSON.parse(extractJsonText(text));
  } catch {
    return null;
  }
}

function extractGeminiText(response: unknown): string {
  const candidates = (response as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates)) return "";
  const parts = (candidates[0] as { content?: { parts?: unknown[] } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (part && typeof part === "object" ? (part as { text?: unknown }).text : ""))
    .filter((text): text is string => typeof text === "string")
    .join("\n");
}

function buildBoardPrompt(profile: GeniusSignalProfile, previousIssues?: string[]): string {
  return [
    "You are the AI personalization layer for EduFinder's Genius! Editor.",
    "The existing 39-question Genius mechanism is authoritative. Do not replace it, rescore it, or invent new student facts.",
    "Use only the provided student signal profile. Every angle must cite 2 to 4 answer IDs from the profile.",
    "Do not write a full college essay or a complete personal statement. Produce brainstorming and coaching artifacts only.",
    "Keep the student's language and concrete details visible. Avoid admissions guarantees, therapy claims, diagnosis, and résumé-padding advice.",
    previousIssues?.length
      ? `Fix these verifier issues from the previous output: ${previousIssues.join("; ")}`
      : "",
    "Return strict JSON matching this TypeScript shape:",
    `{
  "version": 1,
  "generatedAt": "ISO date string",
  "readiness": { "status": "ready", "answeredCount": number, "totalQuestions": number, "summary": "short profile read" },
  "angles": [{
    "id": "short-kebab-id",
    "title": "specific angle title",
    "core": "brainstorming thesis, not essay prose",
    "hiddenTension": "what makes the angle interesting",
    "openingScene": "specific scene direction, not drafted essay text",
    "whyItIsYours": "why this belongs to this student",
    "evidenceAnswerIds": ["answer_id", "answer_id"],
    "coachingMoves": ["next action"],
    "avoid": ["cliche or trap to avoid"],
    "tags": ["tag"]
  }],
  "voicePalette": [{ "phrase": "student phrase or compact voice observation", "whyItMatters": "interpretation", "sourceAnswerIds": ["answer_id"] }],
  "motifs": [{ "motif": "word or motif", "interpretation": "why it matters", "sourceAnswerIds": ["answer_id"] }],
  "discardPile": [{ "title": "generic angle to avoid", "reason": "why it would flatten this student", "sourceAnswerIds": ["answer_id"] }],
  "followUpQuestions": [{ "question": "question to ask the student next", "purpose": "why this unlocks the angle", "sourceAnswerIds": ["answer_id"] }],
  "nextWritingMoves": ["small concrete next step"],
  "safetyNotes": ["authenticity or grounding note"]
}`,
    `Student signal profile JSON:\n${JSON.stringify(profile)}`,
  ].join("\n\n");
}

export class HttpGeniusProviderClient implements GeniusProviderClient {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateBoard(args: {
    profile: GeniusSignalProfile;
    modelId: string;
    thinkingLevel: "high";
    previousIssues?: string[];
  }): Promise<unknown> {
    const key = this.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured.");
    const baseUrl = (this.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta")
      .replace(/\/$/, "");
    const response = await this.fetchImpl(
      `${baseUrl}/models/${encodeURIComponent(args.modelId)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildBoardPrompt(args.profile, args.previousIssues) }],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            thinkingConfig: {
              thinkingLevel: args.thinkingLevel,
            },
            temperature: 0.45,
            maxOutputTokens: 8192,
          },
        }),
        // 360s keeps generate + verify-retry within the 800s route maxDuration.
        signal: AbortSignal.timeout(360_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini Genius board generation failed with ${response.status}.`);
    }

    const json = await response.json();
    return parseJsonFromText(extractGeminiText(json));
  }
}

export function makeLowSignalBoard(profile: GeniusSignalProfile, now = new Date()): GeniusAiBoard {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    readiness: {
      status: "needs_more_signal",
      answeredCount: profile.answeredCount,
      totalQuestions: profile.totalQuestions,
      summary: "The editor needs more answer-backed signal before asking AI to personalize the board.",
    },
    angles: [],
    voicePalette: [],
    motifs: [],
    discardPile: [],
    followUpQuestions: [],
    nextWritingMoves: ["Answer a few more Genius questions with concrete details."],
    safetyNotes: ["AI personalization stays off until there is enough grounded student evidence."],
  };
}
