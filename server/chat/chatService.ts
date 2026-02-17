import { randomUUID } from "node:crypto";
import type { AgentRuntime } from "../agent/types.js";
import type { ChatMessage, ChatSession } from "./chatTypes.js";

export class ChatService {
  private sessions = new Map<string, ChatSession>();

  constructor(private runtime: AgentRuntime) {}

  getSession(sessionId: string): ChatSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: ChatSession = {
      sessionId,
      messages: [
        {
          id: randomUUID(),
          role: "system",
          text: `Session initialized with runtime: ${this.runtime.name}`,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  async sendMessage(agentId: string, sessionId: string, message: string) {
    const session = this.getSession(sessionId);
    const now = new Date().toISOString();

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      text: message,
      createdAt: now,
    };
    session.messages.push(userMessage);

    const run = await this.runtime.run({
      agentId,
      sessionId,
      message,
      conversation: session.messages.map((item) => ({ role: item.role, text: item.text })),
    });

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      text:
        run.status === "completed"
          ? run.assistantText
          : `Agent run failed.\n${run.assistantText}\n${JSON.stringify(run.diagnostics ?? {}, null, 2)}`,
      createdAt: new Date().toISOString(),
    };

    session.messages.push(assistantMessage);

    return {
      session,
      run: {
        id: run.runId,
        status: run.status,
      },
    };
  }
}
