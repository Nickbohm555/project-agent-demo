import { beforeEach, describe, expect, it, vi } from "vitest";

const createAgentSessionMock = vi.fn();
const inMemoryMock = vi.fn(() => ({ kind: "memory-session-manager" }));
const getModelMock = vi.fn(() => ({ provider: "openai", id: "gpt-4.1-mini" }));
const modelConfig = {
  provider: "openai",
  modelId: "gpt-4.1-mini",
  thinkingLevel: "off",
  requiredApiKeyEnv: ["OPENAI_API_KEY"],
  hasRequiredApiKey: true,
} as const;
const toolConfig = {
  cliToolEnabled: false,
  cliWorkdir: process.cwd(),
  cliTimeoutSeconds: 45,
  cliAllowedPrefixes: [],
} as const;

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: {
    inMemory: inMemoryMock,
  },
}));

vi.mock("@mariozechner/pi-ai", () => ({
  getModel: getModelMock,
}));

describe("AgentSessionStore", () => {
  beforeEach(() => {
    createAgentSessionMock.mockReset();
    inMemoryMock.mockClear();
    getModelMock.mockClear();
  });

  it("creates one PI session per agent and reuses it", async () => {
    createAgentSessionMock.mockResolvedValue({
      session: {
        sessionId: "pi-session-1",
        isStreaming: false,
        messages: [],
      },
    });

    const { AgentSessionStore } = await import("../../server/agent/agentSessionStore.js");
    const store = new AgentSessionStore(modelConfig, toolConfig);

    const first = await store.getOrCreate("agent-a");
    const second = await store.getOrCreate("agent-a");

    expect(first.session).toBe(second.session);
    expect(createAgentSessionMock).toHaveBeenCalledTimes(1);
    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(inMemoryMock).toHaveBeenCalledTimes(1);
  });

  it("creates distinct sessions for different agents", async () => {
    createAgentSessionMock
      .mockResolvedValueOnce({
        session: {
          sessionId: "pi-a",
          isStreaming: false,
          messages: [],
        },
      })
      .mockResolvedValueOnce({
        session: {
          sessionId: "pi-b",
          isStreaming: false,
          messages: [],
        },
      });

    const { AgentSessionStore } = await import("../../server/agent/agentSessionStore.js");
    const store = new AgentSessionStore(modelConfig, toolConfig);

    const a = await store.getOrCreate("agent-a");
    const b = await store.getOrCreate("agent-b");

    expect(a.session).not.toBe(b.session);
    expect(createAgentSessionMock).toHaveBeenCalledTimes(2);

    const snapshots = store.list();
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((item) => item.agentId).sort()).toEqual(["agent-a", "agent-b"]);
  });
});
