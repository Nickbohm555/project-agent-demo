import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { AgentSessionStore } from "./agentSessionStore.js";
import type { AgentRuntime, AgentRuntimeRequest, AgentRuntimeResponse } from "./types.js";
import { getToolOutputText } from "./toolOutput.js";

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

function formatToolArgs(args: unknown): string | undefined {
  if (args == null) {
    return undefined;
  }
  if (typeof args === "string") {
    return args;
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
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
      const toolOutputState = new Map<string, { sawUpdate: boolean }>();
      const toolUsage = new Set<string>();

      const unsubscribe = record.session.subscribe((event) => {
        if (logRaw) {
          console.log(
            `[embedded-pi] raw-event agent=${input.agentId} session=${record.session.sessionId} type=${event.type}`,
            event,
          );
        } else if (logAllEvents) {
          const snippet = eventSnippet(event);
          console.log(
            `[embedded-pi] event agent=${input.agentId} session=${record.session.sessionId} type=${event.type}${snippet ? ` text="${snippet}"` : ""}`,
          );
        } else {
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

        if (event.type === "tool_execution_start") {
          if (event.toolName) {
            toolUsage.add(event.toolName);
          }
          const toolArgs = "args" in event ? formatToolArgs((event as { args?: unknown }).args) : undefined;
          input.emit?.({
            type: "tool_call",
            toolName: event.toolName,
            text: toolArgs,
          });
        }

        if (event.type === "tool_execution_update" || event.type === "tool_execution_end") {
          const toolCallId =
            "toolCallId" in event && typeof event.toolCallId === "string" ? event.toolCallId : null;

          if (event.type === "tool_execution_update" && toolCallId) {
            toolOutputState.set(toolCallId, { sawUpdate: true });
          }

          if (event.toolName) {
            toolUsage.add(event.toolName);
          }

          if (event.type === "tool_execution_end" && toolCallId) {
            const state = toolOutputState.get(toolCallId);
            if (state?.sawUpdate) {
              toolOutputState.delete(toolCallId);
              return;
            }
          }

          const outputText = getToolOutputText(event);
          if (outputText) {
            input.emit?.({
              type: "tool_output",
              toolName: event.toolName,
              text: outputText,
            });
          }

          if (event.type === "tool_execution_end" && toolCallId) {
            toolOutputState.delete(toolCallId);
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
      const toolAttribution =
        toolUsage.size > 0 ? `Source: ${[...toolUsage].join(", ")} tool output.` : null;

      return {
        runId: input.runId || randomUUID(),
        status: "completed",
        assistantText,
        toolAttribution,
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
