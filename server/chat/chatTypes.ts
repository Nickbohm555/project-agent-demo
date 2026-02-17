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
