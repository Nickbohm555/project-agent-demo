export type AgentRuntimeRequest = {
  agentId: string;
  sessionId: string;
  message: string;
  conversation: Array<{ role: "user" | "assistant" | "system"; text: string }>;
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
