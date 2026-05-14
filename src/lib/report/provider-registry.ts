import type {
  ModelProvider,
  ModelRole,
  ModelSelection,
} from "./types";

export type ModelRegistryEntry = {
  role: ModelRole;
  provider: ModelProvider;
  preferredModel: string;
  fallbacks: string[];
};

export type AvailableModelsResult = {
  checked: boolean;
  models: string[];
  reason: string | null;
};

export type ModelAvailabilityClient = {
  listModels(provider: ModelProvider): Promise<AvailableModelsResult>;
};

export type ReportModelRegistry = Record<ModelRole, ModelRegistryEntry>;

export const GEMINI_REPORT_MODEL = "gemini-3.1-pro-preview";
export const XAI_REPORT_MODEL = "grok-4.3";

export function getReportModelRegistry(
  _env: Record<string, string | undefined> = process.env,
): ReportModelRegistry {
  void _env;

  return {
    googleEvidence: {
      role: "googleEvidence",
      provider: "gemini",
      preferredModel: GEMINI_REPORT_MODEL,
      fallbacks: [],
    },
    xEvidence: {
      role: "xEvidence",
      provider: "xai",
      preferredModel: XAI_REPORT_MODEL,
      fallbacks: [],
    },
    drafting: {
      role: "drafting",
      provider: "gemini",
      preferredModel: GEMINI_REPORT_MODEL,
      fallbacks: [],
    },
  };
}

function uniqueCandidates(entry: ModelRegistryEntry): string[] {
  return Array.from(new Set([entry.preferredModel, ...entry.fallbacks]));
}

export async function selectAvailableModel(
  entry: ModelRegistryEntry,
  client: ModelAvailabilityClient,
  now = new Date(),
): Promise<ModelSelection> {
  const candidates = uniqueCandidates(entry);
  const checkedAt = now.toISOString();
  const result = await client.listModels(entry.provider);

  if (!result.checked) {
    return {
      role: entry.role,
      provider: entry.provider,
      preferredModel: entry.preferredModel,
      modelId: entry.preferredModel,
      candidates,
      checkedAt,
      availability: "unchecked",
      reason: result.reason,
    };
  }

  const available = new Set(result.models);
  const selected = candidates.find((candidate) => available.has(candidate));

  if (!selected) {
    return {
      role: entry.role,
      provider: entry.provider,
      preferredModel: entry.preferredModel,
      modelId: entry.preferredModel,
      candidates,
      checkedAt,
      availability: "unavailable",
      reason:
        result.reason ??
        `None of the configured ${entry.provider} models are available.`,
    };
  }

  return {
    role: entry.role,
    provider: entry.provider,
    preferredModel: entry.preferredModel,
    modelId: selected,
    candidates,
    checkedAt,
    availability: selected === entry.preferredModel ? "available" : "fallback",
    reason:
      selected === entry.preferredModel
        ? null
        : `${entry.preferredModel} was not available; using ${selected}.`,
  };
}

export async function resolveReportModels(
  client: ModelAvailabilityClient,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<Record<ModelRole, ModelSelection>> {
  const registry = getReportModelRegistry(env);
  const entries = Object.values(registry);
  const selections = await Promise.all(
    entries.map((entry) => selectAvailableModel(entry, client, now)),
  );

  return selections.reduce(
    (acc, selection) => {
      acc[selection.role] = selection;
      return acc;
    },
    {} as Record<ModelRole, ModelSelection>,
  );
}
