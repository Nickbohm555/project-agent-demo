import { createBashTool } from "@mariozechner/pi-coding-agent";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { spawn } from "node:child_process";

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type AgentToolConfig = {
  cliToolEnabled: boolean;
  cliWorkdir: string;
  cliTimeoutSeconds: number;
  cliAllowedPrefixes: string[];
};

export function resolveAgentToolConfig(cwd: string = process.cwd()): AgentToolConfig {
  const cliToolEnabled = envFlag("PI_ENABLE_CLI_TOOL");
  const cliWorkdir = process.env.PI_CLI_WORKDIR?.trim() || cwd;
  const cliTimeoutSeconds = Math.max(1, Number(process.env.PI_CLI_TIMEOUT_SECONDS ?? 45));

  // Empty means no prefix policy (all commands allowed).
  const cliAllowedPrefixes = parseCsv(process.env.PI_CLI_ALLOWED_PREFIXES);

  return {
    cliToolEnabled,
    cliWorkdir,
    cliTimeoutSeconds,
    cliAllowedPrefixes,
  };
}

function assertCommandAllowed(command: string, allowedPrefixes: string[]) {
  if (allowedPrefixes.length === 0) {
    return;
  }
  const normalized = command.trim();
  const allowed = allowedPrefixes.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `Command blocked by PI_CLI_ALLOWED_PREFIXES policy. Command=\"${normalized}\" Allowed prefixes=${allowedPrefixes.join(", ")}`,
    );
  }
}

function runShellCommand(command: string, cwd: string, options: {
  onData: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || "bash";
    const child = spawn(shell, ["-lc", command], {
      cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeoutMs = (options.timeout ?? 45) * 1000;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => options.onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => options.onData(chunk));

    const abortHandler = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abortHandler);

    child.on("error", (err) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);
      reject(err);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);
      resolve({ exitCode });
    });
  });
}

export function buildAgentTools(config: AgentToolConfig): AgentTool<any>[] {
  if (!config.cliToolEnabled) {
    return [];
  }

  const bashTool = createBashTool(config.cliWorkdir, {
    operations: {
      exec: async (command, cwd, options) => {
        assertCommandAllowed(command, config.cliAllowedPrefixes);
        return runShellCommand(command, cwd, {
          ...options,
          timeout: options.timeout ?? config.cliTimeoutSeconds,
        });
      },
    },
  });

  return [bashTool];
}
