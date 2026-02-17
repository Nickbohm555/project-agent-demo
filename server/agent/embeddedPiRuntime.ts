import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { AgentSessionStore } from "./agentSessionStore.js";
import type { AgentRuntime, AgentRuntimeRequest, AgentRuntimeResponse } from "./types.js";

function extractText(message: AgentMessage | undefined): string {
  if (!message || message.role !== "assistant") {
    return "";
  }

  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }
        if ((block as { type?: string }).type === "text") {
          const text = (block as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

export class EmbeddedPiRuntime implements AgentRuntime {
  name = "embedded-pi";

  constructor(private sessionStore: AgentSessionStore) {}

  async run(input: AgentRuntimeRequest): Promise<AgentRuntimeResponse> {
    try {
      const record = await this.sessionStore.getOrCreate(input.agentId);
      const beforeCount = record.session.state.messages.length;

      await record.session.prompt(input.message, {
        expandPromptTemplates: false,
      });

      const nextMessages = record.session.state.messages.slice(beforeCount);
      const lastAssistant = [...nextMessages].reverse().find((message) => message.role === "assistant");
      const assistantText = extractText(lastAssistant) || "Agent completed with no assistant text.";

      return {
        runId: randomUUID(),
        status: "completed",
        assistantText,
        diagnostics: {
          adapter: this.name,
          agentId: input.agentId,
          piSessionId: record.session.sessionId,
          toolsEnabled: 0,
          emittedMessages: nextMessages.length,
        },
      };
    } catch (err) {
      return {
        runId: randomUUID(),
        status: "failed",
        assistantText: "Embedded PI runtime failed.",
        diagnostics: {
          adapter: this.name,
          agentId: input.agentId,
          error: String(err),
        },
      };
    }
  }
}
