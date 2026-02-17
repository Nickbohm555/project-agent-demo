import { getModel, type KnownProvider } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

const PROVIDER_API_KEY_ENV: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  xai: ["XAI_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  venice: ["VENICE_API_KEY"],
  qwen: ["QWEN_API_KEY"],
};

export type AgentModelConfig = {
  provider: KnownProvider;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  requiredApiKeyEnv: string[];
  hasRequiredApiKey: boolean;
};

export function resolveAgentModelConfig(): AgentModelConfig {
  const provider = (process.env.PI_PROVIDER ?? "openai") as KnownProvider;
  const modelId = (process.env.PI_MODEL ?? "gpt-4.1-mini").trim();
  const thinkingLevel = (process.env.PI_THINKING_LEVEL ?? "off") as ThinkingLevel;

  // Validates provider/model pair at startup using pi-ai model registry.
  // Throws with a clear error when model selection is invalid.
  getModel(provider, modelId as never);

  const requiredApiKeyEnv = PROVIDER_API_KEY_ENV[String(provider)] ?? [];
  const hasRequiredApiKey =
    requiredApiKeyEnv.length === 0
      ? true
      : requiredApiKeyEnv.some((name) => Boolean(process.env[name]?.trim()));

  return {
    provider,
    modelId,
    thinkingLevel,
    requiredApiKeyEnv,
    hasRequiredApiKey,
  };
}
