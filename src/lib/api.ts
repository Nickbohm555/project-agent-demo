import type { ChatSession, SendChatRequest, SendChatResponse } from "../types/chat";

export async function fetchHistory(sessionId: string): Promise<ChatSession> {
  const res = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load chat history (${res.status})`);
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
    const body = await res.text();
    throw new Error(body || `Failed to send message (${res.status})`);
  }

  return (await res.json()) as SendChatResponse;
}
