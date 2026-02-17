import { AgentSessionStore } from "./agentSessionStore.js";
import { EmbeddedPiRuntime } from "./embeddedPiRuntime.js";
import { MockAgentRuntime } from "./mockRuntime.js";
import type { AgentRuntime } from "./types.js";

export type RuntimeContext = {
  runtime: AgentRuntime;
  sessionStore: AgentSessionStore;
};

export function buildRuntimeContext(): RuntimeContext {
  const sessionStore = new AgentSessionStore();
  const mode = (process.env.AGENT_RUNTIME ?? "mock").trim().toLowerCase();
  if (mode === "embedded-pi") {
    return { runtime: new EmbeddedPiRuntime(sessionStore), sessionStore };
  }
  return { runtime: new MockAgentRuntime(), sessionStore };
}
