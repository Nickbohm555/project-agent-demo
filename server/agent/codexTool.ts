import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { spawn } from "node:child_process";

const codexToolSchema = Type.Object({
  prompt: Type.String({ description: "Task for Codex CLI to execute." }),
  cwd: Type.Optional(Type.String({ description: "Optional working directory override." })),
});

type CodexToolInput = {
  prompt: string;
  cwd?: string;
};

function quoteShellArg(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

export function createCodexTool(defaultCwd: string): AgentTool<typeof codexToolSchema> {
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

      const cwd = (params.cwd?.trim() || defaultCwd).trim();
      const codexCommand = `codex --dangerously-bypass-approvals-and-sandbox ${quoteShellArg(prompt)}`;
      const shell = process.env.SHELL || "bash";

      const chunks: string[] = [];

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(shell, ["-lc", codexCommand], {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const onAbort = () => child.kill("SIGTERM");
        signal?.addEventListener("abort", onAbort);

        const onChunk = (buffer: Buffer) => {
          const text = buffer.toString("utf8");
          if (!text) {
            return;
          }
          chunks.push(text);
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              status: "stream",
              command: codexCommand,
              cwd,
            },
          });
        };

        child.stdout.on("data", onChunk);
        child.stderr.on("data", onChunk);

        child.on("error", (err) => {
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        });

        child.on("close", (code) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(code);
        });
      });

      const output = chunks.join("").trim();
      const finalText = output || "Codex command completed with no output.";
      const status = exitCode === 0 ? "completed" : "failed";

      return {
        content: [{ type: "text", text: finalText }],
        details: {
          status,
          exitCode,
          command: codexCommand,
          cwd,
        },
      };
    },
  };
}
