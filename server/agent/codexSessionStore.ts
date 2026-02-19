import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";

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

type Disposable = {
  dispose: () => void;
};

type ExitEvent = {
  exitCode?: number;
  signal?: number | string;
};

type CodexProcess = {
  pid?: number;
  write: (text: string) => void;
  kill: () => void;
  onData: (handler: (text: string) => void) => Disposable;
  onExit: (handler: (event: ExitEvent) => void) => Disposable;
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

type CodexSessionRecord = {
  threadId: string;
  cwd: string;
  process: CodexProcess;
  transport: "pty" | "pipe";
  queue: Promise<void>;
  lastUsedAt: string;
  outputTail: string;
};

const MAX_OUTPUT_TAIL = 8_000;
const require = createRequire(import.meta.url);

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

export class CodexSessionStore {
  private sessions = new Map<string, CodexSessionRecord>();
  private lastExitByThread = new Map<string, CodexExitInfo>();
  private warnedAboutPtyFallback = false;
  private forceOneShotByThread = new Set<string>();

  private createPtyProcess(cwd: string): { process: CodexProcess; transport: "pty" } {
    const nodePty = require("@lydell/node-pty") as {
      spawn: (
        file: string,
        args: string[],
        options: {
          name: string;
          cols: number;
          rows: number;
          cwd: string;
          env: NodeJS.ProcessEnv;
        },
      ) => {
        pid: number;
        write: (text: string) => void;
        kill: () => void;
        onData: (handler: (text: string) => void) => Disposable;
        onExit: (handler: (event: ExitEvent) => void) => Disposable;
      };
    };

    const pty = nodePty.spawn("codex", ["--dangerously-bypass-approvals-and-sandbox"], {
      name: "xterm-256color",
      cols: 140,
      rows: 40,
      cwd,
      env: process.env,
    });

    return {
      process: {
        pid: pty.pid,
        write: (text: string) => pty.write(text),
        kill: () => pty.kill(),
        onData: (handler) => pty.onData(handler),
        onExit: (handler) => pty.onExit(handler),
      },
      transport: "pty",
    };
  }

  private createPipeProcess(cwd: string): { process: CodexProcess; transport: "pipe" } {
    const child: ChildProcessWithoutNullStreams = spawn(
      "codex",
      ["--dangerously-bypass-approvals-and-sandbox"],
      {
        cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    return {
      process: {
        pid: child.pid ?? undefined,
        write: (text: string) => {
          child.stdin.write(text);
        },
        kill: () => {
          child.kill("SIGTERM");
        },
        onData: (handler) => {
          const onStdout = (buffer: Buffer) => handler(buffer.toString("utf8"));
          const onStderr = (buffer: Buffer) => handler(buffer.toString("utf8"));
          child.stdout.on("data", onStdout);
          child.stderr.on("data", onStderr);
          return {
            dispose: () => {
              child.stdout.off("data", onStdout);
              child.stderr.off("data", onStderr);
            },
          };
        },
        onExit: (handler) => {
          const onClose = (exitCode: number | null, signal: NodeJS.Signals | null) => {
            handler({
              exitCode: exitCode ?? undefined,
              signal: signal ?? undefined,
            });
          };
          child.on("close", onClose);
          return {
            dispose: () => {
              child.off("close", onClose);
            },
          };
        },
      },
      transport: "pipe",
    };
  }

  private pushTail(current: string, chunk: string): string {
    return `${current}${chunk}`.slice(-MAX_OUTPUT_TAIL);
  }

  private shouldUseOneShot(error: unknown): boolean {
    const text = String(error).toLowerCase();
    return (
      text.includes("stdin is not a terminal") ||
      text.includes("cursor position could not be read")
    );
  }

  private executeOneShot(cwd: string, params: ContinueParams): Promise<ContinueResult> {
    return new Promise<ContinueResult>((resolve, reject) => {
      const child = spawn("codex", ["--dangerously-bypass-approvals-and-sandbox", params.prompt], {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const chunks: string[] = [];
      let done = false;

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
        resolve({ output: (output ?? "").trim() });
      };

      const onChunk = (buffer: Buffer) => {
        const text = buffer.toString("utf8");
        if (!text) {
          return;
        }
        chunks.push(text);
        params.onChunk?.(text);
      };

      const onAbort = () => {
        child.kill("SIGTERM");
        finish(new Error("Codex one-shot aborted"));
      };

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(new Error(`Codex one-shot timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      params.signal?.addEventListener("abort", onAbort);
      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);
      child.on("error", (err) => finish(err));
      child.on("close", (code) => {
        const output = chunks.join("");
        if (code === 0) {
          finish(undefined, output);
          return;
        }
        const details = output.trim() || `Codex one-shot exited with code ${code}`;
        finish(new Error(details));
      });
    });
  }

  start(threadId: string, cwd: string): StartResult {
    const existing = this.sessions.get(threadId);
    if (existing) {
      existing.lastUsedAt = nowIso();
      return {
        started: false,
        running: true,
        threadId,
        cwd: existing.cwd,
        pid: existing.process.pid,
      };
    }

    let processInfo: { process: CodexProcess; transport: "pty" | "pipe" };
    try {
      try {
        processInfo = this.createPtyProcess(cwd);
      } catch {
        processInfo = this.createPipeProcess(cwd);
        if (!this.warnedAboutPtyFallback) {
          this.warnedAboutPtyFallback = true;
          console.warn("[codex] @lydell/node-pty unavailable; using child_process fallback");
        }
      }
    } catch (err) {
      return {
        started: false,
        running: false,
        threadId,
        cwd,
        error: `Failed to start Codex session: ${String(err)}`,
      };
    }

    const record: CodexSessionRecord = {
      threadId,
      cwd,
      process: processInfo.process,
      transport: processInfo.transport,
      queue: Promise.resolve(),
      lastUsedAt: nowIso(),
      outputTail: "",
    };

    record.process.onData((chunk) => {
      if (!chunk) {
        return;
      }
      record.outputTail = this.pushTail(record.outputTail, chunk);
    });

    record.process.onExit((event) => {
      const exitInfo: CodexExitInfo = {
        threadId,
        cwd: record.cwd,
        exitCode: event.exitCode,
        signal: event.signal,
        outputTail: record.outputTail,
        exitedAt: nowIso(),
      };
      this.lastExitByThread.set(threadId, exitInfo);
      console.error("[codex] session exited", exitInfo);
      this.sessions.delete(threadId);
    });

    this.sessions.set(threadId, record);

    return {
      started: true,
      running: true,
      threadId,
      cwd,
      pid: record.process.pid,
    };
  }

  status(threadId: string) {
    const existing = this.sessions.get(threadId);
    if (!existing) {
      return {
        running: false,
        threadId,
        lastExit: this.lastExitByThread.get(threadId),
      };
    }

    return {
      running: true,
      threadId,
      cwd: existing.cwd,
      pid: existing.process.pid,
      lastUsedAt: existing.lastUsedAt,
      transport: existing.transport,
      outputTail: existing.outputTail,
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

    try {
      existing.process.kill();
    } finally {
      this.sessions.delete(threadId);
    }
    return {
      stopped: true,
      running: false,
      threadId,
    };
  }

  async continue(threadId: string, cwd: string, params: ContinueParams): Promise<ContinueResult> {
    if (this.forceOneShotByThread.has(threadId)) {
      return this.executeOneShot(cwd, params);
    }

    const startResult = this.start(threadId, cwd);
    if (!startResult.running) {
      return this.executeOneShot(cwd, params);
    }

    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error("Failed to acquire Codex session");
    }

    const run = async () => {
      try {
        return await this.continueInRecord(record, params);
      } catch (err) {
        if (!this.shouldUseOneShot(err)) {
          throw err;
        }
        this.forceOneShotByThread.add(threadId);
        this.stop(threadId);
        console.warn(
          `[codex] falling back to one-shot mode for thread=${threadId} due to non-interactive terminal error`,
        );
        return this.executeOneShot(cwd, params);
      }
    };
    const task = record.queue.then(run, run);
    record.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private continueInRecord(record: CodexSessionRecord, params: ContinueParams): Promise<ContinueResult> {
    const prompt = ensurePrompt(params.prompt);

    return new Promise<ContinueResult>((resolve, reject) => {
      let output = "";
      let done = false;

      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        record.lastUsedAt = nowIso();
        resolve({ output: output.trim() });
      };

      const fail = (error: Error) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        reject(error);
      };

      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(finish, params.idleMs);
      };

      const onData = (text: string) => {
        if (!text) {
          return;
        }
        output += text;
        params.onChunk?.(text);
        resetIdle();
      };

      const onAbort = () => {
        record.process.write("\u0003");
        fail(new Error("Codex continue aborted"));
      };

      const onExit = () => {
        const exit = this.lastExitByThread.get(record.threadId);
        const outputTail = (exit?.outputTail || output || record.outputTail).slice(-MAX_OUTPUT_TAIL);
        const errorText = [
          `Codex session process exited during continue (thread=${record.threadId}, cwd=${record.cwd}, exitCode=${exit?.exitCode ?? "unknown"}, signal=${exit?.signal ?? "unknown"})`,
          outputTail ? `Recent output:\n${outputTail}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        fail(new Error(errorText));
      };

      const cleanup = () => {
        clearTimeout(hardTimeout);
        clearTimeout(idleTimer);
        dataDisposable.dispose();
        exitDisposable.dispose();
        params.signal?.removeEventListener("abort", onAbort);
      };

      const hardTimeout = setTimeout(() => {
        fail(new Error(`Codex continue timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      let idleTimer = setTimeout(finish, params.idleMs);

      const dataDisposable = record.process.onData(onData);
      const exitDisposable = record.process.onExit(onExit);
      params.signal?.addEventListener("abort", onAbort);

      record.process.write(`${prompt}\n`);
    });
  }
}
