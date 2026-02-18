import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
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

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function eventSnippet(event: AgentSessionEvent): string | undefined {
  if (event.type === "message_update" || event.type === "message_end") {
    const text = extractText(event.message);
    return text ? text.slice(0, 220) : undefined;
  }
  return undefined;
}

function getToolOutputText(event: AgentSessionEvent): string | undefined {
  if (event.type !== "tool_execution_update") {
    return undefined;
  }
  const partialResult = event.partialResult as { content?: Array<{ type?: string; text?: string }> };
  const chunks = Array.isArray(partialResult?.content) ? partialResult.content : [];
  const text = chunks
    .map((chunk) => (chunk?.type === "text" && typeof chunk.text === "string" ? chunk.text : ""))
    .filter(Boolean)
    .join("");
  return text || undefined;
}

export class EmbeddedPiRuntime implements AgentRuntime {
  name = "embedded-pi";

  constructor(private sessionStore: AgentSessionStore) {}

  async run(input: AgentRuntimeRequest): Promise<AgentRuntimeResponse> {
    try {
      const record = await this.sessionStore.getOrCreate(input.agentId, input.sessionId);
      const beforeCount = record.session.state.messages.length;
      const logAllEvents = envFlag("PI_LOG_EVENTS");
      const logAssistant = envFlag("PI_LOG_ASSISTANT_DELTAS");
      const logTools = envFlag("PI_LOG_TOOL_EVENTS");
      const logRaw = envFlag("PI_LOG_RAW_EVENTS");

      const unsubscribe = record.session.subscribe((event) => {
        if (logRaw) {
          console.log(
            `[embedded-pi] raw-event agent=${input.agentId} session=${record.session.sessionId} type=${event.type}`,
            event,
          );
          return;
        }

        if (logAllEvents) {
          const snippet = eventSnippet(event);
          console.log(
            `[embedded-pi] event agent=${input.agentId} session=${record.session.sessionId} type=${event.type}${snippet ? ` text="${snippet}"` : ""}`,
          );
          return;
        }

        if (
          logAssistant &&
          (event.type === "message_update" || event.type === "message_end") &&
          event.message.role === "assistant"
        ) {
          const snippet = eventSnippet(event);
          if (snippet) {
            console.log(
              `[embedded-pi] assistant agent=${input.agentId} session=${record.session.sessionId} type=${event.type} text="${snippet}"`,
            );
          }
          return;
        }

        if (
          logTools &&
          (event.type === "tool_execution_start" ||
            event.type === "tool_execution_update" ||
            event.type === "tool_execution_end")
        ) {
          const toolName = "toolName" in event ? event.toolName : "unknown";
          console.log(
            `[embedded-pi] tool agent=${input.agentId} session=${record.session.sessionId} type=${event.type} name=${toolName}`,
          );
        }

        if (
          (event.type === "message_update" || event.type === "message_end") &&
          event.message.role === "assistant"
        ) {
          const text = extractText(event.message);
          if (text) {
            input.emit?.({
              type: "assistant_delta",
              text,
            });
          }
        }

        if (event.type === "tool_execution_update") {
          const outputText = getToolOutputText(event);
          if (outputText) {
            input.emit?.({
              type: "tool_output",
              toolName: event.toolName,
              text: outputText,
            });
          }
        }
      });

      try {
        await record.session.prompt(input.message, {
          expandPromptTemplates: false,
        });
      } finally {
        unsubscribe();
      }

      const nextMessages = record.session.state.messages.slice(beforeCount);
      const lastAssistant = [...nextMessages].reverse().find((message) => message.role === "assistant");
      const assistantText = extractText(lastAssistant) || "Agent completed with no assistant text.";

      return {
        runId: input.runId || randomUUID(),
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
        runId: input.runId || randomUUID(),
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
