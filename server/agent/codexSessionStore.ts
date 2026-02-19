import { spawn, type ChildProcess } from "node:child_process";

type StreamChunkHandler = (text: string) => void;

type ContinueParams = {
  prompt: string;
  timeoutMs: number;
  idleMs: number;
  signal?: AbortSignal;
  onChunk?: StreamChunkHandler;
};

type ContinueResult = {
  output: string;
};

type CodexExitInfo = {
  threadId: string;
  cwd: string;
  exitCode?: number;
  signal?: number | string;
  outputTail: string;
  exitedAt: string;
};

type StartResult = {
  started: boolean;
  running: boolean;
  threadId: string;
  cwd: string;
  pid?: number;
  error?: string;
};

type SessionStatus =
  | {
      running: false;
      threadId: string;
      pid: undefined;
      lastExit: CodexExitInfo | undefined;
    }
  | {
      running: true;
      threadId: string;
      cwd: string;
      pid: undefined;
      lastUsedAt: string;
      codexThreadId: string | null;
    };

type CodexSessionRecord = {
  threadId: string;
  cwd: string;
  queue: Promise<void>;
  lastUsedAt: string;
  codexThreadId?: string;
};

const MAX_OUTPUT_TAIL = 8_000;
const DEFAULT_BACKEND_COOLDOWN_MS = 30_000;

function nowIso() {
  return new Date().toISOString();
}

function ensurePrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) {
    throw new Error("Codex continue action requires a non-empty prompt");
  }
  return normalized;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value === "") {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function trimTail(text: string, extra: string): string {
  return `${text}${extra}`.slice(-MAX_OUTPUT_TAIL);
}

type CodexJsonEvent = {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
  };
};

function parseJsonLine(line: string): CodexJsonEvent | null {
  try {
    return JSON.parse(line) as CodexJsonEvent;
  } catch {
    return null;
  }
}

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitCompleteLines(buffer: string): { lines: string[]; rest: string } {
  const normalized = normalizeLineBreaks(buffer);
  const parts = normalized.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

function envPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function isUpstreamConnectivityError(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("failed to refresh available models") ||
    normalized.includes("stream disconnected before completion") ||
    normalized.includes("error sending request for url") ||
    normalized.includes("connection reset") ||
    normalized.includes("timed out")
  );
}

export class CodexSessionStore {
  private sessions = new Map<string, CodexSessionRecord>();
  private lastExitByThread = new Map<string, CodexExitInfo>();
  private backendUnavailableUntilByThread = new Map<string, number>();
  private backendUnavailableReasonByThread = new Map<string, string>();

  start(threadId: string, cwd: string): StartResult {
    const existing = this.sessions.get(threadId);
    if (existing) {
      existing.lastUsedAt = nowIso();
      if (existing.cwd !== cwd) {
        existing.cwd = cwd;
      }
      return {
        started: false,
        running: true,
        threadId,
        cwd: existing.cwd,
      };
    }

    const record: CodexSessionRecord = {
      threadId,
      cwd,
      queue: Promise.resolve(),
      lastUsedAt: nowIso(),
    };
    this.sessions.set(threadId, record);

    return {
      started: true,
      running: true,
      threadId,
      cwd,
    };
  }

  status(threadId: string): SessionStatus {
    const existing = this.sessions.get(threadId);
    if (!existing) {
      return {
        running: false,
        threadId,
        pid: undefined,
        lastExit: this.lastExitByThread.get(threadId),
      };
    }

    return {
      running: true,
      threadId,
      cwd: existing.cwd,
      pid: undefined,
      lastUsedAt: existing.lastUsedAt,
      codexThreadId: existing.codexThreadId ?? null,
    };
  }

  stop(threadId: string) {
    const existing = this.sessions.get(threadId);
    if (!existing) {
      return {
        stopped: false,
        running: false,
        threadId,
      };
    }

    this.sessions.delete(threadId);
    return {
      stopped: true,
      running: false,
      threadId,
    };
  }

  async continue(threadId: string, cwd: string, params: ContinueParams): Promise<ContinueResult> {
    const prompt = ensurePrompt(params.prompt);
    const unavailableUntil = this.backendUnavailableUntilByThread.get(threadId) ?? 0;
    if (Date.now() < unavailableUntil) {
      const seconds = Math.ceil((unavailableUntil - Date.now()) / 1000);
      const reason = this.backendUnavailableReasonByThread.get(threadId);
      throw new Error(
        `Codex backend currently unavailable. Retry in ~${seconds}s.${reason ? ` Last error: ${reason}` : ""}`,
      );
    }
    const startResult = this.start(threadId, cwd);
    if (!startResult.running) {
      throw new Error(startResult.error || "Failed to initialize Codex session");
    }

    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error("Failed to acquire Codex session");
    }

    const run = async () => {
      const result = await this.executeTurn(record, prompt, params);
      record.lastUsedAt = nowIso();
      return result;
    };

    const task = record.queue.then(run, run);
    record.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private executeTurn(record: CodexSessionRecord, prompt: string, params: ContinueParams): Promise<ContinueResult> {
    const baseArgs = [
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
    ];

    const args = record.codexThreadId
      ? ["exec", "resume", ...baseArgs, record.codexThreadId, prompt]
      : ["exec", ...baseArgs, prompt];

    return new Promise<ContinueResult>((resolve, reject) => {
      const child: ChildProcess = spawn("codex", args, {
        cwd: record.cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const messages: string[] = [];
      const diagnostics: string[] = [];
      let outputTail = "";
      let stdoutRest = "";
      let stderrRest = "";
      let done = false;

      const includeReasoning = envFlag("PI_CODEX_INCLUDE_REASONING", false);

      const cleanup = () => {
        clearTimeout(timeout);
        params.signal?.removeEventListener("abort", onAbort);
      };

      const finish = (err?: Error, output?: string) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        if (err) {
          reject(err);
          return;
        }
        resolve({ output: output?.trim() || "" });
      };

      const pushDiagnostic = (line: string) => {
        const normalized = line.trim();
        if (!normalized) {
          return;
        }
        diagnostics.push(normalized);
        outputTail = trimTail(outputTail, `${normalized}\n`);
      };

      const onJsonEvent = (event: CodexJsonEvent) => {
        if (event.type === "thread.started" && typeof event.thread_id === "string" && event.thread_id) {
          record.codexThreadId = event.thread_id;
          return;
        }

        if (event.type !== "item.completed") {
          return;
        }

        const itemType = event.item?.type;
        const text = typeof event.item?.text === "string" ? event.item.text.trim() : "";
        if (!text) {
          return;
        }

        if (itemType === "agent_message" || (includeReasoning && itemType === "reasoning")) {
          messages.push(text);
          params.onChunk?.(text);
          outputTail = trimTail(outputTail, `${text}\n`);
          return;
        }

        if (itemType && itemType !== "reasoning") {
          pushDiagnostic(`${itemType}: ${text}`);
        }
      };

      const onStdout = (buffer: Buffer) => {
        const chunk = buffer.toString("utf8");
        if (!chunk) {
          return;
        }

        const split = splitCompleteLines(stdoutRest + chunk);
        stdoutRest = split.rest;

        for (const line of split.lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const parsed = parseJsonLine(trimmed);
          if (parsed) {
            onJsonEvent(parsed);
            continue;
          }

          pushDiagnostic(trimmed);
        }
      };

      const onStderr = (buffer: Buffer) => {
        const chunk = buffer.toString("utf8");
        if (!chunk) {
          return;
        }

        const split = splitCompleteLines(stderrRest + chunk);
        stderrRest = split.rest;

        for (const line of split.lines) {
          pushDiagnostic(line);
        }
      };

      const onAbort = () => {
        child.kill("SIGTERM");
        finish(new Error("Codex continue aborted"));
      };

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(new Error(`Codex continue timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      params.signal?.addEventListener("abort", onAbort);
      child.stdout?.on("data", onStdout);
      child.stderr?.on("data", onStderr);
      child.on("error", (err) => {
        this.lastExitByThread.set(record.threadId, {
          threadId: record.threadId,
          cwd: record.cwd,
          outputTail,
          exitedAt: nowIso(),
        });
        finish(err);
      });
      child.on("close", (exitCode, signal) => {
        if (stdoutRest.trim()) {
          const parsed = parseJsonLine(stdoutRest.trim());
          if (parsed) {
            onJsonEvent(parsed);
          } else {
            pushDiagnostic(stdoutRest.trim());
          }
          stdoutRest = "";
        }
        if (stderrRest.trim()) {
          pushDiagnostic(stderrRest.trim());
          stderrRest = "";
        }

        this.lastExitByThread.set(record.threadId, {
          threadId: record.threadId,
          cwd: record.cwd,
          exitCode: exitCode ?? undefined,
          signal: signal ?? undefined,
          outputTail,
          exitedAt: nowIso(),
        });

        const output = messages.join("\n\n").trim();
        if ((exitCode ?? 0) !== 0) {
          const details = diagnostics.slice(-20).join("\n").trim() || outputTail || `Codex exited with code ${exitCode}`;
          if (isUpstreamConnectivityError(details)) {
            const cooldownMs = envPositiveInt("PI_CODEX_BACKEND_COOLDOWN_MS", DEFAULT_BACKEND_COOLDOWN_MS);
            this.backendUnavailableUntilByThread.set(record.threadId, Date.now() + cooldownMs);
            this.backendUnavailableReasonByThread.set(record.threadId, details.slice(0, 500));
          }
          finish(new Error(details));
          return;
        }

        this.backendUnavailableUntilByThread.delete(record.threadId);
        this.backendUnavailableReasonByThread.delete(record.threadId);

        if (output) {
          finish(undefined, output);
          return;
        }

        const fallback = diagnostics.slice(-10).join("\n").trim();
        finish(undefined, fallback || "Codex prompt completed with no output.");
      });
    });
  }
}
