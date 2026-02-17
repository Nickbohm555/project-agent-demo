import { createAgentSession, SessionManager, type AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel, type KnownProvider } from "@mariozechner/pi-ai";

type SessionRecord = {
  agentId: string;
  session: AgentSession;
  createdAt: string;
  lastUsedAt: string;
};

export class AgentSessionStore {
  private records = new Map<string, SessionRecord>();

  async getOrCreate(agentId: string): Promise<SessionRecord> {
    const existing = this.records.get(agentId);
    if (existing) {
      existing.lastUsedAt = new Date().toISOString();
      return existing;
    }

    const provider = (process.env.PI_PROVIDER ?? "openai") as KnownProvider;
    const modelId = process.env.PI_MODEL ?? "gpt-4.1-mini";
    const model = getModel(provider, modelId as never);

    const { session } = await createAgentSession({
      model,
      tools: [],
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
    }));
  }
}
