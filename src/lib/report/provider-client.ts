import type {
  AdmissionReportJson,
  ApplicantProfile,
  EvidenceCase,
  ModelProvider,
  ModelSelection,
  SchoolReport,
  TargetSchool,
} from "./types";
import type {
  AvailableModelsResult,
  ModelAvailabilityClient,
} from "./provider-registry";

export type DraftReportInput = {
  profile: ApplicantProfile;
  evidence: EvidenceCase[];
  modelSelections: Record<string, ModelSelection>;
};

export type FixReportIssuesInput = {
  profile: ApplicantProfile;
  evidence: EvidenceCase[];
  report: AdmissionReportJson;
  issues: string[];
};

export type ReportProviderClient = ModelAvailabilityClient & {
  collectXEvidence(args: {
    profile: ApplicantProfile;
    school: TargetSchool;
    modelId: string;
    now: Date;
  }): Promise<EvidenceCase[]>;
  collectGoogleAndRedditEvidence(args: {
    profile: ApplicantProfile;
    school: TargetSchool;
    modelId: string;
    now: Date;
  }): Promise<EvidenceCase[]>;
  draftReport(args: DraftReportInput & { modelId: string }): Promise<AdmissionReportJson>;
  fixReportIssues(args: FixReportIssuesInput & { modelId: string }): Promise<AdmissionReportJson>;
};

type HttpClientOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

type ProviderRequestKind = "models" | "evidence" | "draft" | "fixer";

const DEFAULT_TIMEOUT_MS: Record<ProviderRequestKind, number> = {
  models: 10_000,
  evidence: 120_000,
  draft: 120_000,
  fixer: 90_000,
};

const TIMEOUT_ENV_KEY: Record<ProviderRequestKind, string> = {
  models: "REPORT_MODEL_LIST_TIMEOUT_MS",
  evidence: "REPORT_EVIDENCE_TIMEOUT_MS",
  draft: "REPORT_DRAFT_TIMEOUT_MS",
  fixer: "REPORT_FIXER_TIMEOUT_MS",
};

const PROVIDER_CONFIG = {
  gemini: {
    key: "GEMINI_API_KEY",
    baseUrl: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  xai: {
    key: "XAI_API_KEY",
    baseUrl: "XAI_BASE_URL",
    defaultBaseUrl: "https://api.x.ai/v1",
  },
} satisfies Record<
  ModelProvider,
  { key: string; baseUrl: string; defaultBaseUrl: string }
>;

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstArray = trimmed.indexOf("[");
  const firstObject = trimmed.indexOf("{");
  const start =
    firstArray === -1
      ? firstObject
      : firstObject === -1
        ? firstArray
        : Math.min(firstArray, firstObject);
  if (start === -1) return trimmed;

  const lastArray = trimmed.lastIndexOf("]");
  const lastObject = trimmed.lastIndexOf("}");
  const end = Math.max(lastArray, lastObject);
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseJsonFromText<T>(text: string): T | null {
  return safeJsonParse<T>(extractJsonText(text));
}

function timeoutMsFor(
  env: Record<string, string | undefined>,
  kind: ProviderRequestKind,
): number {
  const raw = env[TIMEOUT_ENV_KEY[kind]];
  if (!raw) return DEFAULT_TIMEOUT_MS[kind];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_TIMEOUT_MS[kind];
}

function isRedditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "reddit.com" || host.endsWith(".reddit.com");
  } catch {
    return /reddit\.com/i.test(url);
  }
}

function normalizeEvidenceCase(
  raw: unknown,
  defaults: {
    sourceType: EvidenceCase["sourceType"];
    school: string;
    retrievedAt: string;
    modelId: string;
  },
): EvidenceCase | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const quoteExcerpt =
    typeof row.quoteExcerpt === "string"
      ? row.quoteExcerpt.trim()
      : typeof row.quote === "string"
        ? row.quote.trim()
        : "";

  if (!url || !quoteExcerpt) return null;

  const declared =
    row.sourceType === "google" || row.sourceType === "x" || row.sourceType === "reddit"
      ? row.sourceType
      : null;
  const inferredFromUrl = isRedditUrl(url) ? ("reddit" as const) : null;
  const sourceType = declared ?? inferredFromUrl ?? defaults.sourceType;

  return {
    id:
      typeof row.id === "string" && row.id
        ? row.id
        : `${sourceType}-${Math.random().toString(36).slice(2, 10)}`,
    sourceType,
    school:
      typeof row.school === "string" && row.school.trim()
        ? row.school.trim()
        : defaults.school,
    cycle: typeof row.cycle === "string" ? row.cycle.trim() : "",
    outcome: typeof row.outcome === "string" ? row.outcome.trim() : "",
    round: typeof row.round === "string" ? row.round.trim() : "",
    program: typeof row.program === "string" ? row.program.trim() : "",
    applicantFacts:
      row.applicantFacts && typeof row.applicantFacts === "object" && !Array.isArray(row.applicantFacts)
        ? Object.fromEntries(
            Object.entries(row.applicantFacts as Record<string, unknown>)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, String(value)]),
          )
        : {},
    quoteExcerpt: quoteExcerpt.slice(0, 280),
    url,
    retrievedAt:
      typeof row.retrievedAt === "string" && row.retrievedAt
        ? row.retrievedAt
        : defaults.retrievedAt,
    credibilityScore:
      typeof row.credibilityScore === "number"
        ? Math.max(0, Math.min(1, row.credibilityScore))
        : sourceType === "google"
          ? 0.85
          : 0.55,
    modelId: defaults.modelId,
  };
}

function normalizeEvidenceArray(
  parsed: unknown,
  defaults: {
    sourceType: EvidenceCase["sourceType"];
    school: string;
    retrievedAt: string;
    modelId: string;
  },
): EvidenceCase[] {
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { evidence?: unknown[] }).evidence)
      ? (parsed as { evidence: unknown[] }).evidence
      : [];

  return candidates
    .map((candidate) => normalizeEvidenceCase(candidate, defaults))
    .filter((candidate): candidate is EvidenceCase => Boolean(candidate));
}

function normalizeModelIds(raw: unknown): string[] {
  const ids = new Set<string>();
  const rows = Array.isArray(raw) ? raw : [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.id === "string") ids.add(item.id);
    if (typeof item.name === "string") ids.add(item.name.replace(/^models\//, ""));
    const aliases = item.aliases;
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === "string") ids.add(alias);
      }
    }
  }

  return Array.from(ids);
}

function extractResponseOutputText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const body = response as Record<string, unknown>;
  if (typeof body.output_text === "string") return body.output_text;

  const output = body.output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const contentPart of content) {
      if (!contentPart || typeof contentPart !== "object") continue;
      const text = (contentPart as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
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

function evidenceDateWindow(now: Date): { fromDate: string; toDate: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear() - 3, 0, 1));
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
}

function buildXEvidencePrompt(profile: ApplicantProfile, school: TargetSchool): string {
  return [
    "Collect public admissions evidence from X (formerly Twitter) for an EduFinder college admission report.",
    "Return only JSON. Do not include private handles or personal identifiers; quote excerpts only.",
    "Shape: {\"evidence\":[{\"sourceType\":\"x\",\"school\":\"...\",\"cycle\":\"...\",\"outcome\":\"admitted|waitlisted|denied|deferred\",\"round\":\"ED|EA|RD|...\",\"program\":\"...\",\"applicantFacts\":{\"gpa\":\"...\"},\"quoteExcerpt\":\"short exact excerpt\",\"url\":\"https://x.com/...\",\"credibilityScore\":0.0}]}",
    `Target school: ${school.name}`,
    `Program/major: ${school.program || profile.major || "unspecified"}`,
    `Round: ${school.round || "unspecified"}`,
    `Applicant context: grade ${profile.education.grade}, citizenship ${profile.education.citizenship}, GPA ${profile.academics.gpaUnweighted}, testing SAT ${profile.testing.satTotal}, ACT ${profile.testing.actTotal}, current school ${profile.education.currentSchool}.`,
  ].join("\n");
}

function buildGoogleAndRedditEvidencePrompt(
  profile: ApplicantProfile,
  school: TargetSchool,
): string {
  return [
    "Collect public admissions evidence for an EduFinder college admission report.",
    "Use Google web search broadly, and especially search Reddit (site:reddit.com) for first-person applicant reports.",
    "Return only JSON. Quote excerpts only; never identify private applicants.",
    "Tag each row's sourceType as \"google\" for general web results (school sites, Common Data Set, news, blogs) and \"reddit\" for reddit.com threads or comments.",
    "Shape: {\"evidence\":[{\"sourceType\":\"google|reddit\",\"school\":\"...\",\"cycle\":\"...\",\"outcome\":\"admitted|waitlisted|denied|deferred|stat\",\"round\":\"ED|EA|RD|...\",\"program\":\"...\",\"applicantFacts\":{\"gpa\":\"...\"},\"quoteExcerpt\":\"short exact excerpt\",\"url\":\"https://...\",\"credibilityScore\":0.0}]}",
    `Target school: ${school.name}`,
    `Program/major: ${school.program || profile.major || "unspecified"}`,
    `Round: ${school.round || "unspecified"}`,
    `Applicant context: grade ${profile.education.grade}, citizenship ${profile.education.citizenship}, GPA ${profile.academics.gpaUnweighted}, testing SAT ${profile.testing.satTotal}, ACT ${profile.testing.actTotal}, current school ${profile.education.currentSchool}.`,
  ].join("\n");
}

function buildDraftPrompt(input: DraftReportInput): string {
  return [
    "Draft an admissions report as strict JSON matching the version 1 AdmissionReportJson schema.",
    "Do not write HTML. Every evidence-dependent claim must cite evidenceIds already present in the evidence list.",
    "Use chance bands only from: Very High Reach, High Reach, Reach, Borderline Target, Target, Likely.",
    "Cite google, reddit, and x evidence appropriately. Quote excerpts must be byte-equal to the supplied evidence.",
    "Self-audit before returning: no guarantee language; chance bands for schools with admit rate < 10% cannot be Likely; every similarCases.quoteExcerpt must match its source exactly.",
    `Applicant profile JSON:\n${JSON.stringify(input.profile)}`,
    `Evidence JSON:\n${JSON.stringify(input.evidence)}`,
    `Model selections JSON:\n${JSON.stringify(input.modelSelections)}`,
  ].join("\n\n");
}

function buildFixerPrompt(input: FixReportIssuesInput): string {
  return [
    "You are repairing an admissions report draft that failed local rule-based verification.",
    "Return ONLY the corrected full AdmissionReportJson (version 1) as strict JSON.",
    "Address each listed issue without changing unrelated content. Preserve the report structure.",
    "Rules: chance bands only from {Very High Reach, High Reach, Reach, Borderline Target, Target, Likely}; no guarantee language; for any school with admit rate < 10%, chanceBand cannot be Likely; every similarCases.quoteExcerpt must be byte-equal to the matching evidence.quoteExcerpt; every cited evidenceId must exist in the evidence list.",
    `Verifier issues to fix:\n- ${input.issues.join("\n- ")}`,
    `Evidence JSON:\n${JSON.stringify(input.evidence)}`,
    `Report JSON to repair:\n${JSON.stringify(input.report)}`,
    `Applicant profile JSON:\n${JSON.stringify(input.profile)}`,
  ].join("\n\n");
}

type GeminiSchema = Record<string, unknown>;

const stringSchema: GeminiSchema = { type: "STRING" };
const stringArraySchema: GeminiSchema = {
  type: "ARRAY",
  items: stringSchema,
};
const evidenceIdArraySchema: GeminiSchema = {
  type: "ARRAY",
  items: stringSchema,
};
const sourceTypeSchema: GeminiSchema = {
  type: "STRING",
  enum: ["google", "reddit", "x"],
};
const chanceBandSchema: GeminiSchema = {
  type: "STRING",
  enum: [
    "Very High Reach",
    "High Reach",
    "Reach",
    "Borderline Target",
    "Target",
    "Likely",
  ],
};
const confidenceSchema: GeminiSchema = {
  type: "STRING",
  enum: ["high", "medium", "low"],
};

const similarCaseSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    evidenceId: stringSchema,
    sourceType: sourceTypeSchema,
    outcome: stringSchema,
    quoteExcerpt: stringSchema,
    url: stringSchema,
  },
  required: ["evidenceId", "sourceType", "outcome", "quoteExcerpt", "url"],
  propertyOrdering: ["evidenceId", "sourceType", "outcome", "quoteExcerpt", "url"],
};

const schoolReportSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    school: stringSchema,
    program: stringSchema,
    round: stringSchema,
    chanceBand: chanceBandSchema,
    confidence: confidenceSchema,
    officialBaseline: {
      type: "OBJECT",
      properties: {
        admitRatePercent: {
          type: "NUMBER",
          nullable: true,
        },
        middle50Sat: stringSchema,
        middle50Act: stringSchema,
        notes: stringSchema,
        evidenceIds: evidenceIdArraySchema,
      },
      required: [
        "admitRatePercent",
        "middle50Sat",
        "middle50Act",
        "notes",
        "evidenceIds",
      ],
      propertyOrdering: [
        "admitRatePercent",
        "middle50Sat",
        "middle50Act",
        "notes",
        "evidenceIds",
      ],
    },
    studentFit: stringSchema,
    similarCases: {
      type: "ARRAY",
      items: similarCaseSchema,
    },
    reasons: stringArraySchema,
    actions: stringArraySchema,
  },
  required: [
    "school",
    "program",
    "round",
    "chanceBand",
    "confidence",
    "officialBaseline",
    "studentFit",
    "similarCases",
    "reasons",
    "actions",
  ],
  propertyOrdering: [
    "school",
    "program",
    "round",
    "chanceBand",
    "confidence",
    "officialBaseline",
    "studentFit",
    "similarCases",
    "reasons",
    "actions",
  ],
};

const admissionReportResponseSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    version: {
      type: "INTEGER",
    },
    generatedAt: stringSchema,
    executiveSnapshot: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          school: stringSchema,
          chanceBand: chanceBandSchema,
          confidence: confidenceSchema,
          strongestFactor: stringSchema,
          biggestConcern: stringSchema,
          evidenceIds: evidenceIdArraySchema,
        },
        required: [
          "school",
          "chanceBand",
          "confidence",
          "strongestFactor",
          "biggestConcern",
          "evidenceIds",
        ],
        propertyOrdering: [
          "school",
          "chanceBand",
          "confidence",
          "strongestFactor",
          "biggestConcern",
          "evidenceIds",
        ],
      },
    },
    applicantRead: {
      type: "OBJECT",
      properties: {
        academics: stringSchema,
        testing: stringSchema,
        curriculum: stringSchema,
        activities: stringSchema,
        awards: stringSchema,
        leadership: stringSchema,
        context: stringSchema,
      },
      required: [
        "academics",
        "testing",
        "curriculum",
        "activities",
        "awards",
        "leadership",
        "context",
      ],
      propertyOrdering: [
        "academics",
        "testing",
        "curriculum",
        "activities",
        "awards",
        "leadership",
        "context",
      ],
    },
    schools: {
      type: "ARRAY",
      items: schoolReportSchema,
    },
    strategy: {
      type: "OBJECT",
      properties: {
        schoolListBalance: stringSchema,
        earlyRoundGuidance: stringSchema,
        riskNotes: stringArraySchema,
      },
      required: ["schoolListBalance", "earlyRoundGuidance", "riskNotes"],
      propertyOrdering: ["schoolListBalance", "earlyRoundGuidance", "riskNotes"],
    },
    actionPlan: {
      type: "OBJECT",
      properties: {
        next30Days: stringArraySchema,
        next90Days: stringArraySchema,
        applicationSeason: stringArraySchema,
      },
      required: ["next30Days", "next90Days", "applicationSeason"],
      propertyOrdering: ["next30Days", "next90Days", "applicationSeason"],
    },
    evidenceAppendix: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          evidenceId: stringSchema,
          sourceType: sourceTypeSchema,
          school: stringSchema,
          url: stringSchema,
          retrievedAt: stringSchema,
          quoteExcerpt: stringSchema,
        },
        required: [
          "evidenceId",
          "sourceType",
          "school",
          "url",
          "retrievedAt",
          "quoteExcerpt",
        ],
        propertyOrdering: [
          "evidenceId",
          "sourceType",
          "school",
          "url",
          "retrievedAt",
          "quoteExcerpt",
        ],
      },
    },
  },
  required: [
    "version",
    "generatedAt",
    "executiveSnapshot",
    "applicantRead",
    "schools",
    "strategy",
    "actionPlan",
    "evidenceAppendix",
  ],
  propertyOrdering: [
    "version",
    "generatedAt",
    "executiveSnapshot",
    "applicantRead",
    "schools",
    "strategy",
    "actionPlan",
    "evidenceAppendix",
  ],
};

function coerceReport(value: unknown): AdmissionReportJson {
  const candidates = value && typeof value === "object"
    ? [
        value,
        (value as { report?: unknown }).report,
        (value as { admissionReport?: unknown }).admissionReport,
        (value as { admissionReportJson?: unknown }).admissionReportJson,
        (value as { result?: unknown }).result,
      ]
    : [value];

  const report = candidates.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const candidateReport = candidate as AdmissionReportJson;
    return candidateReport.version === 1 && Array.isArray(candidateReport.schools);
  });

  if (!report || typeof report !== "object") {
    throw new Error("Report draft did not contain JSON.");
  }
  const coerced = report as AdmissionReportJson;
  if (coerced.version !== 1 || !Array.isArray(coerced.schools)) {
    throw new Error("Report draft JSON does not match version 1 report shape.");
  }
  return coerced;
}

export class HttpReportProviderClient implements ReportProviderClient {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listModels(provider: ModelProvider): Promise<AvailableModelsResult> {
    const config = PROVIDER_CONFIG[provider];
    const key = this.env[config.key];
    if (!key) {
      return {
        checked: false,
        models: [],
        reason: `${config.key} is not configured.`,
      };
    }

    try {
      const baseUrl = this.env[config.baseUrl] || config.defaultBaseUrl;
      const response = await this.fetchImpl(this.modelsUrl(provider, baseUrl), {
        headers: this.authHeaders(provider, key),
        signal: this.timeoutSignal("models"),
      });
      if (!response.ok) {
        return {
          checked: false,
          models: [],
          reason: `${provider} model list failed with ${response.status}.`,
        };
      }
      const json = (await response.json()) as Record<string, unknown>;
      const models = normalizeModelIds(
        (json.data as unknown[]) ??
          (json.models as unknown[]) ??
          (json.model_info as unknown[]),
      );
      return { checked: true, models, reason: null };
    } catch (error) {
      return {
        checked: false,
        models: [],
        reason: error instanceof Error ? error.message : `Could not check ${provider} models.`,
      };
    }
  }

  async collectXEvidence({
    profile,
    school,
    modelId,
    now,
  }: {
    profile: ApplicantProfile;
    school: TargetSchool;
    modelId: string;
    now: Date;
  }): Promise<EvidenceCase[]> {
    const key = this.requiredKey("xai");
    const baseUrl = this.baseUrl("xai");
    const { fromDate, toDate } = evidenceDateWindow(now);
    const response = await this.fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        ...this.authHeaders("xai", key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        input: [{ role: "user", content: buildXEvidencePrompt(profile, school) }],
        tools: [
          {
            type: "x_search",
            from_date: fromDate,
            to_date: toDate,
          },
        ],
        reasoning: { effort: "high" },
      }),
      signal: this.timeoutSignal("evidence"),
    });

    if (!response.ok) {
      throw new Error(`xAI X Search failed with ${response.status}.`);
    }

    const json = await response.json();
    const parsed = parseJsonFromText<unknown>(extractResponseOutputText(json));
    return normalizeEvidenceArray(parsed, {
      sourceType: "x",
      school: school.name,
      retrievedAt: now.toISOString(),
      modelId,
    });
  }

  async collectGoogleAndRedditEvidence({
    profile,
    school,
    modelId,
    now,
  }: {
    profile: ApplicantProfile;
    school: TargetSchool;
    modelId: string;
    now: Date;
  }): Promise<EvidenceCase[]> {
    const key = this.requiredKey("gemini");
    const baseUrl = this.baseUrl("gemini");
    const response = await this.fetchImpl(
      `${baseUrl}/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildGoogleAndRedditEvidencePrompt(profile, school) }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "high" },
          },
        }),
        signal: this.timeoutSignal("evidence"),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini grounded search failed with ${response.status}.`);
    }

    const json = await response.json();
    const parsed = parseJsonFromText<unknown>(extractGeminiText(json));
    return normalizeEvidenceArray(parsed, {
      sourceType: "google",
      school: school.name,
      retrievedAt: now.toISOString(),
      modelId,
    });
  }

  async draftReport(args: DraftReportInput & { modelId: string }): Promise<AdmissionReportJson> {
    const key = this.requiredKey("gemini");
    const baseUrl = this.baseUrl("gemini");
    const response = await this.fetchImpl(
      `${baseUrl}/models/${encodeURIComponent(args.modelId)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildDraftPrompt(args) }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: admissionReportResponseSchema,
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: "high" },
          },
        }),
        signal: this.timeoutSignal("draft"),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini report drafting failed with ${response.status}.`);
    }

    const json = await response.json();
    const parsed = parseJsonFromText<AdmissionReportJson>(extractGeminiText(json));
    return coerceReport(parsed);
  }

  async fixReportIssues(
    args: FixReportIssuesInput & { modelId: string },
  ): Promise<AdmissionReportJson> {
    const key = this.requiredKey("xai");
    const baseUrl = this.baseUrl("xai");
    const response = await this.fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        ...this.authHeaders("xai", key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.modelId,
        input: [{ role: "user", content: buildFixerPrompt(args) }],
        reasoning: { effort: "high" },
        text: { format: { type: "json_object" } },
      }),
      signal: this.timeoutSignal("fixer"),
    });

    if (!response.ok) {
      throw new Error(`Grok report fixer failed with ${response.status}.`);
    }

    const json = await response.json();
    const parsed = parseJsonFromText<AdmissionReportJson>(extractResponseOutputText(json));
    return coerceReport(parsed);
  }

  private modelsUrl(_provider: ModelProvider, baseUrl: string): string {
    return `${baseUrl}/models`;
  }

  private authHeaders(provider: ModelProvider, key: string): Record<string, string> {
    if (provider === "gemini") return { "x-goog-api-key": key };
    return { Authorization: `Bearer ${key}` };
  }

  private baseUrl(provider: ModelProvider): string {
    const config = PROVIDER_CONFIG[provider];
    return (this.env[config.baseUrl] || config.defaultBaseUrl).replace(/\/$/, "");
  }

  private timeoutSignal(kind: ProviderRequestKind): AbortSignal {
    return AbortSignal.timeout(timeoutMsFor(this.env, kind));
  }

  private requiredKey(provider: ModelProvider): string {
    const key = this.env[PROVIDER_CONFIG[provider].key];
    if (!key) throw new Error(`${PROVIDER_CONFIG[provider].key} is not configured.`);
    return key;
  }
}

export function getEvidenceIdsForSchool(
  evidence: EvidenceCase[],
  schoolName: string,
): string[] {
  const normalized = schoolName.toLowerCase();
  return evidence
    .filter((item) => item.school.toLowerCase() === normalized)
    .map((item) => item.id);
}

export function makeEmptySchoolReport(
  school: TargetSchool,
  evidence: EvidenceCase[],
  generatedAt: string,
): SchoolReport {
  const evidenceIds = getEvidenceIdsForSchool(evidence, school.name);
  return {
    school: school.name,
    program: school.program,
    round: school.round,
    chanceBand: "Reach",
    confidence: evidenceIds.length ? "medium" : "low",
    officialBaseline: {
      admitRatePercent: null,
      middle50Sat: "",
      middle50Act: "",
      notes: "Official statistics were not available in the collected source set.",
      evidenceIds: [],
    },
    studentFit: `Initial fit read for ${school.name} generated at ${generatedAt}.`,
    similarCases: [],
    reasons: [
      evidenceIds.length
        ? "Evidence coverage is limited and should be treated as directional."
        : "No comparable public cases were collected, so confidence is low.",
    ],
    actions: ["Confirm the latest official admissions statistics before relying on this band."],
  };
}
