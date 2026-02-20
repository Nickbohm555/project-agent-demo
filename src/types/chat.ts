export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
};

export type ChatSession = {
  sessionId: string;
  messages: ChatMessage[];
};

export type SendChatRequest = {
  agentId: string;
  sessionId: string;
  message: string;
};

export type SendChatResponse = {
  session: ChatSession;
  run: {
    id: string;
    status: "accepted" | "completed" | "failed";
  };
};

export type ChatStreamEvent = {
  sessionId: string;
  runId: string;
  type: "lifecycle" | "assistant_delta" | "tool_call" | "tool_output";
  phase?: "start" | "end" | "error";
  text?: string;
  toolName?: string;
  timestamp: string;
};

export type AgentRuntimeInfo = {
  runtime: string;
  configuredTools?: string[];
  toolCatalog?: Array<{
    name: string;
    kind: "built-in" | "custom";
    enabled: boolean;
  }>;
  toolConfig?: {
    codexToolEnabled?: boolean;
    codexBridgeUrl?: string | null;
  };
  loggingFlags?: Record<string, string>;
};

export type CodexAction = "start" | "continue" | "stop" | "status";

export type CodexExecuteRequest = {
  sessionId: string;
  action: CodexAction;
  prompt?: string;
};

export type CodexExecuteResponse = {
  ok: boolean;
  sessionId: string;
  action: CodexAction;
  text: string;
  streamText: string;
  details: Record<string, unknown> | null;
  timestamp: string;
};
