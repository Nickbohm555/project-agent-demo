import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
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
  prompt: Type.Optional(
    Type.String({ description: "Prompt to send when action=continue. Thread/session binding is internal." }),
  ),
});

type CodexToolInput = {
  action?: "start" | "continue" | "stop" | "status";
  prompt?: string;
};

export function createCodexTool(options: {
  defaultCwd: string;
  threadId: string;
  sessionStore: CodexSessionStore;
}): ToolDefinition<typeof codexToolSchema> {
  return {
    name: "codex",
    label: "Codex Session",
    description:
      "Manage a long-lived Codex CLI session for the current chat session. Actions: start, continue, stop, status. Do not ask the user for threadId/session identifiers; they are provided internally by the server.",
    parameters: codexToolSchema,
    execute: async (_toolCallId, params: CodexToolInput, signal, onUpdate) => {
      const action = params.action ?? (params.prompt ? "continue" : "status");
      const cwd = options.defaultCwd;

      if (action === "start") {
        const status = options.sessionStore.start(options.threadId, cwd);
        const text = status.running
          ? status.started
            ? `Started Codex session for thread ${options.threadId} (pid=${status.pid ?? "unknown"}) in ${cwd}`
            : `Codex session already running for thread ${options.threadId} (pid=${status.pid ?? "unknown"})`
          : `Failed to start Codex session for thread ${options.threadId}: ${status.error ?? "unknown error"}`;
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
        const exitInfo =
          !status.running && status.lastExit
            ? ` Last exit: code=${status.lastExit.exitCode}, signal=${status.lastExit.signal}, at=${status.lastExit.exitedAt}`
            : "";
        const text = status.running
          ? `Codex session is running for thread ${options.threadId} (pid=${status.pid ?? "unknown"})`
          : `No Codex session running for thread ${options.threadId}.${exitInfo}`;
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

      try {
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
      } catch (err) {
        const errorText = String(err);
        return {
          content: [{ type: "text", text: `Codex continue failed.\n${errorText}` }],
          details: {
            action,
            status: "error",
            threadId: options.threadId,
            cwd,
            error: errorText,
          },
        };
      }
    },
  };
}
