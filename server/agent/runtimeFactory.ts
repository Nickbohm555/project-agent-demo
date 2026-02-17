import { AgentSessionStore } from "./agentSessionStore.js";
import { EmbeddedPiRuntime } from "./embeddedPiRuntime.js";
import { MockAgentRuntime } from "./mockRuntime.js";
import { resolveAgentModelConfig, type AgentModelConfig } from "./modelConfig.js";
import { resolveAgentToolConfig, type AgentToolConfig } from "./toolConfig.js";
import type { AgentRuntime } from "./types.js";

export type RuntimeContext = {
  runtime: AgentRuntime;
  sessionStore: AgentSessionStore;
  modelConfig: AgentModelConfig;
  toolConfig: AgentToolConfig;
};

export function buildRuntimeContext(): RuntimeContext {
  const modelConfig = resolveAgentModelConfig();
  const toolConfig = resolveAgentToolConfig();
  const sessionStore = new AgentSessionStore(modelConfig, toolConfig);
  const mode = (process.env.AGENT_RUNTIME ?? "embedded-pi").trim().toLowerCase();
  if (mode === "mock") {
    return { runtime: new MockAgentRuntime(), sessionStore, modelConfig, toolConfig };
  }
  return { runtime: new EmbeddedPiRuntime(sessionStore), sessionStore, modelConfig, toolConfig };
}
