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

type CodexBridgeResponse = {
  ok: boolean;
  text: string;
  streamText?: string;
  details?: Record<string, unknown> | null;
};

function stripAnsiAndControl(text: string): string {
  // Remove ANSI escape/control sequences commonly emitted by PTY sessions.
  const ansiStripped = text.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-ntqry=><~])/g,
    "",
  );
  return ansiStripped
    // Remove common residual VT mode fragments that may remain without ESC bytes.
    .replace(/\[\?[0-9;]*[a-zA-Z]/g, "")
    .replace(/\[>[0-9;]*[a-zA-Z]/g, "")
    .replace(/\[[0-9;]*n/g, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function sanitizeCodexText(text: string, prompt?: string): string {
  const stripped = stripAnsiAndControl(text).trim();
  if (!stripped) {
    return "";
  }

  if (!prompt) {
    return stripped;
  }

  const promptTrimmed = prompt.trim();
  if (!promptTrimmed) {
    return stripped;
  }

  let normalized = stripped;
  if (normalized.startsWith(promptTrimmed)) {
    normalized = normalized.slice(promptTrimmed.length).trim();
  }

  const lines = normalized.split("\n");
  const filtered = lines.filter((line, index) => !(index === 0 && line.trim() === promptTrimmed));
  const cleaned = filtered.join("\n").trim();

  if (/^[0-9]+u$/i.test(cleaned)) {
    return "";
  }
  if (/^[\-_=+*|\\/,'"`.;:~^!?()\[\]\s]+$/.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value === "") {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function codexLog(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  if (!envFlag("PI_LOG_CODEX_TOOL", true)) {
    return;
  }
  const line = `[codex-tool] ${event} ${JSON.stringify(details)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function normalizeBridgeUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isBridgeConnectivityError(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("ehostunreach") ||
    normalized.includes("socket hang up") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("network")
  );
}

async function executeBridgeAction(input: {
  bridgeUrl: string;
  threadId: string;
  action: "start" | "continue" | "stop" | "status";
  prompt?: string;
  signal?: AbortSignal;
}): Promise<CodexBridgeResponse> {
  const timeoutMs = envPositiveInt("PI_CODEX_BRIDGE_TIMEOUT_MS", 30_000);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const endpoint = `${normalizeBridgeUrl(input.bridgeUrl)}/execute`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: input.threadId,
      action: input.action,
      prompt: input.prompt,
    }),
    signal: requestSignal,
  });
  const payload = (await res.json()) as CodexBridgeResponse & {
    error?: string;
    details?: unknown;
  };
  if (!res.ok || payload.ok === false) {
    const detail = payload.error ? `${payload.error}${payload.details ? `: ${String(payload.details)}` : ""}` : JSON.stringify(payload);
    throw new Error(`Codex bridge request failed (${res.status}): ${detail}`);
  }
  return payload;
}

export function createCodexTool(options: {
  defaultCwd: string;
  threadId: string;
  sessionStore: CodexSessionStore;
  bridgeUrl?: string | null;
}): ToolDefinition<typeof codexToolSchema> {
  return {
    name: "codex",
    label: "Codex Session",
    description:
      "Manage a long-lived Codex CLI session for the current chat session. Use ONLY when the user explicitly requests running the Codex tool in their current message. Actions: start, continue, stop, status. Do not ask the user for threadId/session identifiers; they are provided internally by the server.",
    parameters: codexToolSchema,
    execute: async (toolCallId, params: CodexToolInput, signal, onUpdate) => {
      const startedAtMs = Date.now();
      const action = params.action ?? (params.prompt ? "continue" : "status");
      const cwd = options.defaultCwd;
      let bridgeFallback = false;
      codexLog("info", "execute.start", {
        toolCallId,
        threadId: options.threadId,
        action,
        cwd,
        bridgeUrl: options.bridgeUrl ?? null,
        prompt: params.prompt ?? null,
        promptChars: (params.prompt ?? "").trim().length,
      });

      if (options.bridgeUrl) {
        try {
          const bridgeResult = await executeBridgeAction({
            bridgeUrl: options.bridgeUrl,
            threadId: options.threadId,
            action,
            prompt: params.prompt,
            signal,
          });
          const streamText = (bridgeResult.streamText ?? "").trim();
          const text = (bridgeResult.text ?? "").trim();
          if (streamText) {
            onUpdate?.({
              content: [{ type: "text" as const, text: streamText }],
              details: {
                status: "stream",
                action,
                threadId: options.threadId,
              },
            });
          }
          const responseText = text || streamText || "Codex prompt completed with no output.";
          codexLog("info", "execute.bridge.result", {
            toolCallId,
            threadId: options.threadId,
            action,
            elapsedMs: Date.now() - startedAtMs,
            textChars: responseText.length,
          });
          return {
            content: [{ type: "text" as const, text: responseText }],
            details: (bridgeResult.details as Record<string, unknown> | undefined) ?? {
              action,
              threadId: options.threadId,
              cwd,
              bridged: true,
            },
          };
        } catch (err) {
          const errorText = String(err);
          const fallbackEnabled = envFlag("PI_CODEX_BRIDGE_FALLBACK", true);
          const shouldFallback = fallbackEnabled && isBridgeConnectivityError(errorText);
          if (!shouldFallback) {
            codexLog("error", "execute.bridge.error", {
              toolCallId,
              threadId: options.threadId,
              action,
              elapsedMs: Date.now() - startedAtMs,
              error: errorText,
            });
            return {
              content: [{ type: "text" as const, text: `Codex ${action} failed.\n${errorText}` }],
              details: {
                action,
                status: "error",
                threadId: options.threadId,
                cwd,
                bridgeUrl: options.bridgeUrl,
                error: errorText,
              },
            };
          }
          bridgeFallback = true;
          codexLog("warn", "execute.bridge.fallback", {
            toolCallId,
            threadId: options.threadId,
            action,
            elapsedMs: Date.now() - startedAtMs,
            error: errorText,
            bridgeUrl: options.bridgeUrl,
          });
        }
      }

      const fallbackDetails = bridgeFallback
        ? {
            bridgeFallback: true,
            bridgeUrl: options.bridgeUrl ?? null,
          }
        : {};

      if (action === "start") {
        const status = options.sessionStore.start(options.threadId, cwd);
        const text = status.running
          ? status.started
            ? `Started Codex session for thread ${options.threadId} (pid=${status.pid ?? "unknown"}) in ${cwd}`
            : `Codex session already running for thread ${options.threadId} (pid=${status.pid ?? "unknown"})`
          : `Failed to start Codex session for thread ${options.threadId}: ${status.error ?? "unknown error"}`;
        const result = {
          content: [{ type: "text" as const, text }],
          details: {
            action,
            ...status,
            ...fallbackDetails,
          },
        };
        codexLog(status.running ? "info" : "error", "execute.start.result", {
          toolCallId,
          threadId: options.threadId,
          action,
          running: status.running,
          started: status.started,
          pid: status.pid ?? null,
          elapsedMs: Date.now() - startedAtMs,
          error: status.error ?? null,
        });
        return result;
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
        const result = {
          content: [{ type: "text" as const, text }],
          details: {
            action,
            ...status,
            ...fallbackDetails,
          },
        };
        codexLog("info", "execute.status.result", {
          toolCallId,
          threadId: options.threadId,
          action,
          running: status.running,
          pid: "pid" in status ? (status.pid ?? null) : null,
          elapsedMs: Date.now() - startedAtMs,
        });
        return result;
      }

      if (action === "stop") {
        const stopped = options.sessionStore.stop(options.threadId);
        const text = stopped.stopped
          ? `Stopped Codex session for thread ${options.threadId}`
          : `No Codex session to stop for thread ${options.threadId}`;
        const result = {
          content: [{ type: "text" as const, text }],
          details: {
            action,
            ...stopped,
            ...fallbackDetails,
          },
        };
        codexLog(stopped.stopped ? "info" : "warn", "execute.stop.result", {
          toolCallId,
          threadId: options.threadId,
          action,
          stopped: stopped.stopped,
          elapsedMs: Date.now() - startedAtMs,
        });
        return result;
      }

      const prompt = (params.prompt ?? "").trim();
      if (!prompt) {
        codexLog("warn", "execute.continue.invalid_prompt", {
          toolCallId,
          threadId: options.threadId,
          action,
          elapsedMs: Date.now() - startedAtMs,
        });
        throw new Error("codex continue action requires a non-empty prompt");
      }

      try {
        let streamChunks = 0;
        let streamChars = 0;
        const sanitizedStreamChunks: string[] = [];
        codexLog("info", "execute.continue.begin", {
          toolCallId,
          threadId: options.threadId,
          action,
          prompt,
          promptChars: prompt.length,
        });
        const result = await options.sessionStore.continue(options.threadId, cwd, {
          prompt,
          timeoutMs: envPositiveInt("PI_CODEX_TIMEOUT_MS", 30_000),
          idleMs: envPositiveInt("PI_CODEX_IDLE_MS", 4_000),
          signal,
          onChunk: (rawText) => {
            streamChunks += 1;
            streamChars += rawText.length;
            const text = sanitizeCodexText(rawText, prompt);
            if (text) {
              sanitizedStreamChunks.push(text);
            }
            codexLog("info", "execute.continue.stream", {
              toolCallId,
              threadId: options.threadId,
              action,
              chunkIndex: streamChunks,
              chunkCharsRaw: rawText.length,
              chunkCharsClean: text.length,
              totalStreamChars: streamChars,
              chunkPreview: text.slice(0, 200),
            });
            if (text) {
              onUpdate?.({
                content: [{ type: "text" as const, text }],
                details: {
                  status: "stream",
                  action,
                  threadId: options.threadId,
                },
              });
            }
          },
        });

        const finalOutput = sanitizeCodexText(result.output, prompt);
        const streamText = sanitizeCodexText(sanitizedStreamChunks.join("\n"), prompt);
        const responseText = finalOutput || streamText || "Codex prompt completed with no output.";

        codexLog("info", "execute.continue.result", {
          toolCallId,
          threadId: options.threadId,
          action,
          elapsedMs: Date.now() - startedAtMs,
          streamChunks,
          streamChars,
          outputCharsRaw: result.output.length,
          outputCharsClean: responseText.length,
        });
        return {
          content: [{ type: "text" as const, text: responseText }],
          details: {
            action,
            threadId: options.threadId,
            cwd,
            ...fallbackDetails,
          },
        };
      } catch (err) {
        const errorText = String(err);
        codexLog("error", "execute.continue.error", {
          toolCallId,
          threadId: options.threadId,
          action,
          elapsedMs: Date.now() - startedAtMs,
          error: errorText,
        });
        return {
          content: [{ type: "text" as const, text: `Codex continue failed.\n${errorText}` }],
          details: {
            action,
            status: "error",
            threadId: options.threadId,
            cwd,
            error: errorText,
            ...fallbackDetails,
          },
        };
      }
    },
  };
}
