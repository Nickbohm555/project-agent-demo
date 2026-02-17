import { createAgentSession, SessionManager, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { AgentModelConfig } from "./modelConfig.js";
import { buildAgentTools, type AgentToolConfig } from "./toolConfig.js";

type SessionRecord = {
  agentId: string;
  session: AgentSession;
  createdAt: string;
  lastUsedAt: string;
};

export class AgentSessionStore {
  private records = new Map<string, SessionRecord>();

  constructor(
    private modelConfig: AgentModelConfig,
    private toolConfig: AgentToolConfig,
  ) {}

  async getOrCreate(agentId: string): Promise<SessionRecord> {
    const existing = this.records.get(agentId);
    if (existing) {
      existing.lastUsedAt = new Date().toISOString();
      return existing;
    }

    const model = getModel(this.modelConfig.provider, this.modelConfig.modelId as never);

    const { session } = await createAgentSession({
      model,
      thinkingLevel: this.modelConfig.thinkingLevel,
      tools: buildAgentTools(this.toolConfig),
      sessionManager: SessionManager.inMemory(process.cwd()),
      cwd: process.cwd(),
    });

    const now = new Date().toISOString();
    const created: SessionRecord = {
      agentId,
      session,
      createdAt: now,
      lastUsedAt: now,
    };

    this.records.set(agentId, created);
    return created;
  }

  list() {
    return Array.from(this.records.values()).map((record) => ({
      agentId: record.agentId,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      piSessionId: record.session.sessionId,
      isStreaming: record.session.isStreaming,
      messages: record.session.messages.length,
      activeTools:
        typeof record.session.getActiveToolNames === "function"
          ? record.session.getActiveToolNames()
          : [],
      model: `${this.modelConfig.provider}/${this.modelConfig.modelId}`,
      thinkingLevel: this.modelConfig.thinkingLevel,
    }));
  }
}
