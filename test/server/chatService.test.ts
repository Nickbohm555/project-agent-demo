import { describe, expect, it } from "vitest";
import { ChatService } from "../../server/chat/chatService.js";
import { ChatEventBus } from "../../server/chat/chatEvents.js";
import type { AgentRuntime } from "../../server/agent/types.js";

class TestRuntime implements AgentRuntime {
  name = "test-runtime";

  async run(_input: Parameters<AgentRuntime["run"]>[0]) {
    return {
      runId: "run-123",
      status: "completed" as const,
      assistantText: "Test assistant response",
    };
  }
}

class ThrowingRuntime implements AgentRuntime {
  name = "throwing-runtime";

  async run() {
    throw new Error("runtime exploded");
  }
}

describe("ChatService", () => {
  it("creates a new session with an initialization system message", () => {
    const service = new ChatService(new TestRuntime(), new ChatEventBus());
    const session = service.getSession("s1");

    expect(session.sessionId).toBe("s1");
    expect(session.messages.length).toBe(1);
    expect(session.messages[0]?.role).toBe("system");
  });

  it("appends user and assistant messages when sending", async () => {
    const service = new ChatService(new TestRuntime(), new ChatEventBus());
    const result = await service.sendMessage("agent-a", "s2", "hello");

    expect(result.run.id).toBeTruthy();
    expect(result.session.messages.at(-2)?.role).toBe("user");
    expect(result.session.messages.at(-1)?.role).toBe("assistant");
    expect(result.session.messages.at(-1)?.text).toContain("Test assistant response");
  });

  it("returns failed run data when runtime throws instead of throwing", async () => {
    const service = new ChatService(new ThrowingRuntime(), new ChatEventBus());

    const result = await service.sendMessage("agent-a", "s3", "hello");

    expect(result.run.status).toBe("failed");
    expect(result.session.messages.at(-2)?.role).toBe("user");
    expect(result.session.messages.at(-1)?.role).toBe("assistant");
    expect(result.session.messages.at(-1)?.text).toContain("Agent run failed.");
    expect(result.session.messages.at(-1)?.text).toContain("runtime exploded");
  });
});
