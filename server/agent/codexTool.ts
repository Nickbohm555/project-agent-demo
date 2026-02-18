import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { PersistentTerminalStore } from "./persistentTerminal.js";

const codexToolSchema = Type.Object({
  prompt: Type.String({ description: "Task for Codex CLI to execute." }),
  cwd: Type.Optional(Type.String({ description: "Optional working directory override." })),
});

type CodexToolInput = {
  prompt: string;
  cwd?: string;
};

function quoteShellArg(input: string): string {
  return `'${input.replace(/'/g, `"'"'`)}'`;
}

export function createCodexTool(options: {
  defaultCwd: string;
  threadId: string;
  terminalStore: PersistentTerminalStore;
}): AgentTool<typeof codexToolSchema> {
  return {
    name: "codex",
    label: "Codex CLI",
    description:
      "Run Codex CLI for codebase tasks. Uses command: codex --dangerously-bypass-approvals-and-sandbox <prompt>",
    parameters: codexToolSchema,
    execute: async (_toolCallId, params: CodexToolInput, signal, onUpdate) => {
      const prompt = params.prompt.trim();
      if (!prompt) {
        throw new Error("codex tool requires a non-empty prompt");
      }

      const cwd = (params.cwd?.trim() || options.defaultCwd).trim();
      const codexCommand = `codex --dangerously-bypass-approvals-and-sandbox ${quoteShellArg(prompt)}`;

      const result = await options.terminalStore.execute(options.threadId, cwd, {
        command: codexCommand,
        timeoutMs: 10 * 60 * 1000,
        signal,
        onChunk: (text) => {
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              status: "stream",
              command: codexCommand,
              cwd,
              threadId: options.threadId,
            },
          });
        },
      });

      const finalText = result.output || "Codex command completed with no output.";
      const status = result.exitCode === 0 ? "completed" : "failed";

      return {
        content: [{ type: "text", text: finalText }],
        details: {
          status,
          exitCode: result.exitCode,
          command: codexCommand,
          cwd,
          threadId: options.threadId,
        },
      };
    },
  };
}
