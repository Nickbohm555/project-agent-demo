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
