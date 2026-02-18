import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

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

type CodexSessionRecord = {
  threadId: string;
  cwd: string;
  process: ChildProcessWithoutNullStreams;
  queue: Promise<void>;
  lastUsedAt: string;
};

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

  start(threadId: string, cwd: string) {
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

    const child = spawn("codex", ["--dangerously-bypass-approvals-and-sandbox"], {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const record: CodexSessionRecord = {
      threadId,
      cwd,
      process: child,
      queue: Promise.resolve(),
      lastUsedAt: nowIso(),
    };

    child.on("close", () => {
      this.sessions.delete(threadId);
    });

    this.sessions.set(threadId, record);

    return {
      started: true,
      running: true,
      threadId,
      cwd,
      pid: child.pid,
    };
  }

  status(threadId: string) {
    const existing = this.sessions.get(threadId);
    if (!existing) {
      return {
        running: false,
        threadId,
      };
    }

    return {
      running: true,
      threadId,
      cwd: existing.cwd,
      pid: existing.process.pid,
      lastUsedAt: existing.lastUsedAt,
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

    existing.process.kill("SIGTERM");
    this.sessions.delete(threadId);
    return {
      stopped: true,
      running: false,
      threadId,
    };
  }

  async continue(threadId: string, cwd: string, params: ContinueParams): Promise<ContinueResult> {
    this.start(threadId, cwd);
    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error("Failed to acquire Codex session");
    }

    const run = async () => this.continueInRecord(record, params);
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

      const onData = (buffer: Buffer) => {
        const text = buffer.toString("utf8");
        if (!text) {
          return;
        }
        output += text;
        params.onChunk?.(text);
        resetIdle();
      };

      const onAbort = () => {
        record.process.stdin.write("\u0003");
        fail(new Error("Codex continue aborted"));
      };

      const onProcessClose = () => {
        fail(new Error("Codex session process exited during continue"));
      };

      const cleanup = () => {
        clearTimeout(hardTimeout);
        clearTimeout(idleTimer);
        record.process.stdout.off("data", onData);
        record.process.stderr.off("data", onData);
        record.process.off("close", onProcessClose);
        params.signal?.removeEventListener("abort", onAbort);
      };

      const hardTimeout = setTimeout(() => {
        fail(new Error(`Codex continue timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      let idleTimer = setTimeout(finish, params.idleMs);

      record.process.stdout.on("data", onData);
      record.process.stderr.on("data", onData);
      record.process.on("close", onProcessClose);
      params.signal?.addEventListener("abort", onAbort);

      record.process.stdin.write(`${prompt}\n`);
    });
  }
}
