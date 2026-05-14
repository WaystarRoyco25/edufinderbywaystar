import test from "node:test";
import assert from "node:assert/strict";
import {
  getReportModelRegistry,
  selectAvailableModel,
} from "../src/lib/report/provider-registry.ts";
import type { ModelProvider } from "../src/lib/report/types.ts";

test("report model registry resolves only Gemini and Grok with three roles", () => {
  const registry = getReportModelRegistry({});
  const roles = Object.keys(registry).sort();
  assert.deepEqual(roles, ["drafting", "googleEvidence", "xEvidence"]);

  const providers = new Set(Object.values(registry).map((entry) => entry.provider));
  assert.deepEqual([...providers].sort(), ["gemini", "xai"]);

  assert.equal(registry.googleEvidence.provider, "gemini");
  assert.equal(registry.googleEvidence.preferredModel, "gemini-3.1-pro-preview");
  assert.equal(registry.xEvidence.provider, "xai");
  assert.equal(registry.xEvidence.preferredModel, "grok-4.3");
  assert.equal(registry.drafting.provider, "gemini");
  assert.equal(registry.drafting.preferredModel, "gemini-3.1-pro-preview");
});

test("xAI model selection uses grok-4.3 when available", async () => {
  const selection = await selectAvailableModel(
    {
      role: "xEvidence",
      provider: "xai",
      preferredModel: "grok-4.3",
      fallbacks: ["grok-4.20-reasoning"],
    },
    {
      async listModels(provider: ModelProvider) {
        assert.equal(provider, "xai");
        return { checked: true, models: ["grok-4.3"], reason: null };
      },
    },
    new Date("2026-05-02T00:00:00.000Z"),
  );

  assert.equal(selection.modelId, "grok-4.3");
  assert.equal(selection.availability, "available");
});

test("xAI model selection falls back when grok-4.3 is unavailable", async () => {
  const selection = await selectAvailableModel(
    {
      role: "xEvidence",
      provider: "xai",
      preferredModel: "grok-4.3",
      fallbacks: ["grok-4.20-reasoning"],
    },
    {
      async listModels() {
        return { checked: true, models: ["grok-4.20-reasoning"], reason: null };
      },
    },
    new Date("2026-05-02T00:00:00.000Z"),
  );

  assert.equal(selection.modelId, "grok-4.20-reasoning");
  assert.equal(selection.availability, "fallback");
  assert.match(selection.reason ?? "", /grok-4\.3/);
});

test("model selection records unchecked provider availability", async () => {
  const selection = await selectAvailableModel(
    {
      role: "xEvidence",
      provider: "xai",
      preferredModel: "grok-4.3",
      fallbacks: ["grok-4.20-reasoning"],
    },
    {
      async listModels() {
        return {
          checked: false,
          models: [],
          reason: "XAI_API_KEY is not configured.",
        };
      },
    },
    new Date("2026-05-02T00:00:00.000Z"),
  );

  assert.equal(selection.modelId, "grok-4.3");
  assert.equal(selection.availability, "unchecked");
  assert.equal(selection.reason, "XAI_API_KEY is not configured.");
});
