import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";

type ExecuteParams = {
  command: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
};

type ExecuteResult = {
  output: string;
  exitCode: number;
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class TerminalSession {
  private shell: ChildProcessWithoutNullStreams;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly cwd: string,
    private readonly onClose: () => void,
  ) {
    this.shell = this.spawnShell();
  }

  private spawnShell() {
    const shellPath = process.env.SHELL || "bash";
    const child = spawn(shellPath, ["-l"], {
      cwd: this.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.on("close", () => {
      this.onClose();
    });

    return child;
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const task = async () => this.executeInternal(params);
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private executeInternal(params: ExecuteParams): Promise<ExecuteResult> {
    const marker = `__PAD_DONE_${randomUUID()}__`;
    const markerRegex = new RegExp(`${escapeRegex(marker)}:(-?\\d+)`);

    let buffer = "";
    let finished = false;

    return new Promise<ExecuteResult>((resolve, reject) => {
      const cleanup = () => {
        this.shell.stdout.off("data", onData);
        this.shell.stderr.off("data", onData);
        params.signal?.removeEventListener("abort", onAbort);
        clearTimeout(timeout);
      };

      const finish = (result: ExecuteResult) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        resolve(result);
      };

      const fail = (error: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        reject(error);
      };

      const onData = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (!text) {
          return;
        }

        buffer += text;
        params.onChunk?.(text);

        const markerMatch = markerRegex.exec(buffer);
        if (!markerMatch) {
          return;
        }

        const markerText = markerMatch[0];
        const markerIndex = buffer.indexOf(markerText);
        const output = markerIndex >= 0 ? buffer.slice(0, markerIndex) : buffer;
        const parsedExit = Number(markerMatch[1]);
        finish({
          output: output.trim(),
          exitCode: Number.isFinite(parsedExit) ? parsedExit : 1,
        });
      };

      const onAbort = () => {
        this.shell.stdin.write("\u0003");
        fail(new Error("terminal command aborted"));
      };

      const timeout = setTimeout(() => {
        this.shell.stdin.write("\u0003");
        fail(new Error(`terminal command timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      this.shell.stdout.on("data", onData);
      this.shell.stderr.on("data", onData);
      params.signal?.addEventListener("abort", onAbort);

      const script = `${params.command}\nprintf '${marker}:%s\\n' $?\\n`;
      this.shell.stdin.write(script);
    });
  }

  dispose() {
    this.shell.kill("SIGTERM");
  }
}

export class PersistentTerminalStore {
  private sessions = new Map<string, TerminalSession>();

  private getOrCreateSession(threadId: string, cwd: string): TerminalSession {
    const existing = this.sessions.get(threadId);
    if (existing) {
      return existing;
    }

    const session = new TerminalSession(cwd, () => {
      this.sessions.delete(threadId);
    });
    this.sessions.set(threadId, session);
    return session;
  }

  async execute(threadId: string, cwd: string, params: ExecuteParams): Promise<ExecuteResult> {
    const session = this.getOrCreateSession(threadId, cwd);
    return session.execute(params);
  }

  reset(threadId: string): boolean {
    const session = this.sessions.get(threadId);
    if (!session) {
      return false;
    }
    session.dispose();
    this.sessions.delete(threadId);
    return true;
  }
}
