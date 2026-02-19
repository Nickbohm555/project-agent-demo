import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRuntimeResponse } from "../agent/types.js";
import type { ChatEventBus } from "./chatEvents.js";
import type { ChatMessage, ChatSession } from "./chatTypes.js";

export class ChatService {
  private sessions = new Map<string, ChatSession>();

  constructor(
    private runtime: AgentRuntime,
    private events: ChatEventBus,
  ) {}

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
    const runId = randomUUID();
    const startedAtMs = Date.now();

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      text: message,
      createdAt: now,
    };
    session.messages.push(userMessage);

    this.events.publish({
      sessionId,
      runId,
      type: "lifecycle",
      phase: "start",
      timestamp: new Date().toISOString(),
    });
    console.log(
      `[chat] run started runId=${runId} agentId=${agentId} sessionId=${sessionId} runtime=${this.runtime.name} inputChars=${message.length}`,
    );

    let run: AgentRuntimeResponse;
    try {
      run = await this.runtime.run({
        runId,
        agentId,
        sessionId,
        message,
        conversation: session.messages.map((item) => ({ role: item.role, text: item.text })),
        emit: (event) => {
          this.events.publish({
            sessionId,
            runId,
            timestamp: new Date().toISOString(),
            ...event,
          });
        },
      });
    } catch (err) {
      const errorText = String(err);
      this.events.publish({
        sessionId,
        runId,
        type: "lifecycle",
        phase: "error",
        text: errorText,
        timestamp: new Date().toISOString(),
      });
      run = {
        runId,
        status: "failed",
        assistantText: "Agent run failed.",
        diagnostics: {
          adapter: this.runtime.name,
          agentId,
          error: errorText,
        },
      };
    }

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

    this.events.publish({
      sessionId,
      runId,
      type: "lifecycle",
      phase: run.status === "completed" ? "end" : "error",
      timestamp: new Date().toISOString(),
    });
    const elapsedMs = Date.now() - startedAtMs;
    console.log(
      `[chat] run finished runId=${runId} agentId=${agentId} sessionId=${sessionId} status=${run.status} elapsedMs=${elapsedMs}`,
    );

    return {
      session,
      run: {
        id: runId,
        status: run.status,
      },
    };
  }
}
