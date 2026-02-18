import { spawn, type IPty } from "@lydell/node-pty";

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
  pty: IPty;
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
        pid: existing.pty.pid,
      };
    }

    const pty = spawn("codex", ["--dangerously-bypass-approvals-and-sandbox"], {
      name: "xterm-256color",
      cols: 140,
      rows: 40,
      cwd,
      env: process.env,
    });

    const record: CodexSessionRecord = {
      threadId,
      cwd,
      pty,
      queue: Promise.resolve(),
      lastUsedAt: nowIso(),
    };

    pty.onExit(() => {
      this.sessions.delete(threadId);
    });

    this.sessions.set(threadId, record);

    return {
      started: true,
      running: true,
      threadId,
      cwd,
      pid: pty.pid,
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
      pid: existing.pty.pid,
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

    try {
      existing.pty.kill();
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

      const onData = (text: string) => {
        if (!text) {
          return;
        }
        output += text;
        params.onChunk?.(text);
        resetIdle();
      };

      const onAbort = () => {
        record.pty.write("\u0003");
        fail(new Error("Codex continue aborted"));
      };

      const onExit = () => {
        fail(new Error("Codex session process exited during continue"));
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

      const dataDisposable = record.pty.onData(onData);
      const exitDisposable = record.pty.onExit(onExit);
      params.signal?.addEventListener("abort", onAbort);

      record.pty.write(`${prompt}\r`);
    });
  }
}
