import type {
  AgentRuntimeInfo,
  ChatSession,
  CodexExecuteRequest,
  CodexExecuteResponse,
  SendChatRequest,
  SendChatResponse,
} from "../types/chat";

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.text();
  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as { error?: string; details?: unknown };
    if (parsed.error && parsed.details != null) {
      return `${parsed.error}: ${String(parsed.details)}`;
    }
    if (parsed.error) {
      return parsed.error;
    }
  } catch {
    // non-JSON response body
  }

  return body;
}

export async function fetchHistory(sessionId: string): Promise<ChatSession> {
  const res = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Failed to load chat history (${res.status})`));
  }
  return (await res.json()) as ChatSession;
}

export async function sendMessage(payload: SendChatRequest): Promise<SendChatResponse> {
  const res = await fetch("/api/chat/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Failed to send message (${res.status})`));
  }

  return (await res.json()) as SendChatResponse;
}

export async function fetchRuntimeInfo(): Promise<AgentRuntimeInfo> {
  const res = await fetch("/api/agent/runtime");
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Failed to load runtime info (${res.status})`));
  }
  return (await res.json()) as AgentRuntimeInfo;
}

export async function executeCodexAction(payload: CodexExecuteRequest): Promise<CodexExecuteResponse> {
  const res = await fetch("/api/codex/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Failed to execute codex action (${res.status})`));
  }

  return (await res.json()) as CodexExecuteResponse;
}
