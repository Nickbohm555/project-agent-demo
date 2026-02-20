import { beforeEach, describe, expect, it, vi } from "vitest";

const createAgentSessionMock = vi.fn();
const inMemoryMock = vi.fn(() => ({ kind: "memory-session-manager" }));
const getModelMock = vi.fn(() => ({ provider: "openai", id: "gpt-4.1-mini" }));
const setRuntimeApiKeyMock = vi.fn();
class AuthStorageMock {
  setRuntimeApiKey = setRuntimeApiKeyMock;
}
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
  codexToolEnabled: false,
  codexWorkdir: process.cwd(),
  codexBridgeUrl: null,
} as const;

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: createAgentSessionMock,
  AuthStorage: AuthStorageMock,
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
    setRuntimeApiKeyMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("creates one PI session per agent and reuses it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    createAgentSessionMock.mockResolvedValue({
      session: {
        sessionId: "pi-session-1",
        isStreaming: false,
        messages: [],
      },
    });

    const { AgentSessionStore } = await import("../../server/agent/agentSessionStore.js");
    const store = new AgentSessionStore(modelConfig, toolConfig);

    const first = await store.getOrCreate("agent-a", "thread-1");
    const second = await store.getOrCreate("agent-a", "thread-1");

    expect(first.session).toBe(second.session);
    expect(createAgentSessionMock).toHaveBeenCalledTimes(1);
    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(inMemoryMock).toHaveBeenCalledTimes(1);
    expect(setRuntimeApiKeyMock).toHaveBeenCalledWith("openai", "sk-test");
  });

  it("creates distinct sessions for different agents", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
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

    const a = await store.getOrCreate("agent-a", "thread-1");
    const b = await store.getOrCreate("agent-b", "thread-2");

    expect(a.session).not.toBe(b.session);
    expect(createAgentSessionMock).toHaveBeenCalledTimes(2);

    const snapshots = store.list();
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((item) => item.agentId).sort()).toEqual(["agent-a", "agent-b"]);
    expect(snapshots.map((item) => item.sessionId).sort()).toEqual(["thread-1", "thread-2"]);
  });
});
