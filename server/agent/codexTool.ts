import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { CodexSessionStore } from "./codexSessionStore.js";

const codexToolSchema = Type.Object({
  action: Type.Optional(
    Type.Union([
      Type.Literal("start"),
      Type.Literal("continue"),
      Type.Literal("stop"),
      Type.Literal("status"),
    ]),
  ),
  prompt: Type.Optional(Type.String({ description: "Prompt to send when action=continue." })),
});

type CodexToolInput = {
  action?: "start" | "continue" | "stop" | "status";
  prompt?: string;
};

export function createCodexTool(options: {
  defaultCwd: string;
  threadId: string;
  sessionStore: CodexSessionStore;
}): AgentTool<typeof codexToolSchema> {
  return {
    name: "codex",
    label: "Codex Session",
    description:
      "Manage a long-lived Codex CLI session. Actions: start, continue, stop, status. Continue sends prompt to the existing Codex session.",
    parameters: codexToolSchema,
    execute: async (_toolCallId, params: CodexToolInput, signal, onUpdate) => {
      const action = params.action ?? (params.prompt ? "continue" : "status");
      const cwd = options.defaultCwd;

      if (action === "start") {
        const status = options.sessionStore.start(options.threadId, cwd);
        const text = status.started
          ? `Started Codex session for thread ${options.threadId} (pid=${status.pid ?? "unknown"}) in ${cwd}`
          : `Codex session already running for thread ${options.threadId} (pid=${status.pid ?? "unknown"})`;
        return {
          content: [{ type: "text", text }],
          details: {
            action,
            ...status,
          },
        };
      }

      if (action === "status") {
        const status = options.sessionStore.status(options.threadId);
        const text = status.running
          ? `Codex session is running for thread ${options.threadId} (pid=${status.pid ?? "unknown"})`
          : `No Codex session running for thread ${options.threadId}`;
        return {
          content: [{ type: "text", text }],
          details: {
            action,
            ...status,
          },
        };
      }

      if (action === "stop") {
        const stopped = options.sessionStore.stop(options.threadId);
        const text = stopped.stopped
          ? `Stopped Codex session for thread ${options.threadId}`
          : `No Codex session to stop for thread ${options.threadId}`;
        return {
          content: [{ type: "text", text }],
          details: {
            action,
            ...stopped,
          },
        };
      }

      const prompt = (params.prompt ?? "").trim();
      if (!prompt) {
        throw new Error("codex continue action requires a non-empty prompt");
      }

      const result = await options.sessionStore.continue(options.threadId, cwd, {
        prompt,
        timeoutMs: 10 * 60 * 1000,
        idleMs: 1_200,
        signal,
        onChunk: (text) => {
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              status: "stream",
              action,
              threadId: options.threadId,
            },
          });
        },
      });

      return {
        content: [{ type: "text", text: result.output || "Codex prompt completed with no output." }],
        details: {
          action,
          threadId: options.threadId,
          cwd,
        },
      };
    },
  };
}
