import { describe, expect, it, vi } from "vitest";
import { resolveAgentModelConfig } from "../../server/agent/modelConfig.js";

describe("resolveAgentModelConfig", () => {
  it("marks api key missing for openai when unset", () => {
    vi.stubEnv("PI_PROVIDER", "openai");
    vi.stubEnv("PI_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_API_KEY", "");

    const cfg = resolveAgentModelConfig();

    expect(cfg.provider).toBe("openai");
    expect(cfg.modelId).toBe("gpt-4.1-mini");
    expect(cfg.requiredApiKeyEnv).toEqual(["OPENAI_API_KEY"]);
    expect(cfg.hasRequiredApiKey).toBe(false);

    vi.unstubAllEnvs();
  });

  it("marks api key present when configured", () => {
    vi.stubEnv("PI_PROVIDER", "openai");
    vi.stubEnv("PI_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");

    const cfg = resolveAgentModelConfig();

    expect(cfg.hasRequiredApiKey).toBe(true);
    vi.unstubAllEnvs();
  });
});
