import type { ChatStreamEvent } from "../chat/chatEvents.js";

export type AgentRuntimeRequest = {
  runId: string;
  agentId: string;
  sessionId: string;
  message: string;
  conversation: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  emit?: (event: Omit<ChatStreamEvent, "sessionId" | "runId" | "timestamp">) => void;
};

export type AgentRuntimeResponse = {
  runId: string;
  status: "completed" | "failed";
  assistantText: string;
  diagnostics?: Record<string, unknown>;
};

export interface AgentRuntime {
  name: string;
  run(input: AgentRuntimeRequest): Promise<AgentRuntimeResponse>;
}
