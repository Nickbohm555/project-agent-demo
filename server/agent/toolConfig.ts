import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createCodexTool } from "./codexTool.js";
import { CodexSessionStore } from "./codexSessionStore.js";

const codexSessionStore = new CodexSessionStore();

export function getCodexSessionStore(): CodexSessionStore {
  return codexSessionStore;
}

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export type AgentToolConfig = {
  codexToolEnabled: boolean;
  codexWorkdir: string;
  codexBridgeUrl: string | null;
};

export type ResolvedAgentTools = {
  builtInTools: AgentTool<any>[];
  customTools: Array<ToolDefinition<any, any>>;
};

export type AgentToolDescriptor = {
  name: string;
  kind: "built-in" | "custom";
  enabled: boolean;
};

export function getToolCatalog(config: AgentToolConfig): AgentToolDescriptor[] {
  return [
    { name: "codex", kind: "custom", enabled: config.codexToolEnabled },
  ];
}

export function getConfiguredToolNames(config: AgentToolConfig): string[] {
  return getToolCatalog(config)
    .filter((tool) => tool.enabled)
    .map((tool) => tool.name);
}

export function resolveAgentToolConfig(cwd: string = process.cwd()): AgentToolConfig {
  const codexWorkdir = process.env.PI_CODEX_WORKDIR?.trim() || cwd;
  const rawCodexEnabled = process.env.PI_ENABLE_CODEX_TOOL;
  const codexBridgeEnabled = envFlag("PI_ENABLE_CODEX_BRIDGE");
  const codexBridgeUrl = codexBridgeEnabled ? process.env.PI_CODEX_BRIDGE_URL?.trim() || null : null;
  const codexToolEnabled = rawCodexEnabled == null || rawCodexEnabled.trim() === ""
    ? true
    : envFlag("PI_ENABLE_CODEX_TOOL");

  return {
    codexToolEnabled,
    codexWorkdir,
    codexBridgeUrl,
  };
}

export function buildAgentTools(
  config: AgentToolConfig,
  context: { threadId: string },
): ResolvedAgentTools {
  const builtInTools: AgentTool<any>[] = [];
  const customTools: Array<ToolDefinition<any, any>> = [];

  if (config.codexToolEnabled) {
    customTools.push(
      createCodexTool({
        defaultCwd: config.codexWorkdir,
        threadId: context.threadId,
        sessionStore: codexSessionStore,
        bridgeUrl: config.codexBridgeUrl,
      }),
    );
  }

  return { builtInTools, customTools };
}
