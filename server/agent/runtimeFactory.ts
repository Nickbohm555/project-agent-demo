import { EmbeddedPiRuntime } from "./embeddedPiRuntime.js";
import { MockAgentRuntime } from "./mockRuntime.js";
import type { AgentRuntime } from "./types.js";

export function buildRuntime(): AgentRuntime {
  const mode = (process.env.AGENT_RUNTIME ?? "mock").trim().toLowerCase();
  if (mode === "embedded-pi") {
    return new EmbeddedPiRuntime();
  }
  return new MockAgentRuntime();
}
