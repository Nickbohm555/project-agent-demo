import { describe, expect, it, vi } from "vitest";
import { GatewayRouter } from "../../../server/gateway/core/router.js";
import { InboundDeduper } from "../../../server/gateway/core/delivery.js";

describe("GatewayRouter", () => {
  it("routes inbound text through chat service and returns assistant text", async () => {
    const sendMessage = vi.fn(async () => ({
      session: {
        sessionId: "s1",
        messages: [
          {
            id: "assistant-1",
            role: "assistant" as const,
            text: "hello from agent",
            createdAt: new Date().toISOString(),
          },
        ],
      },
      run: {
        id: "run-1",
        status: "completed" as const,
      },
    }));

    const router = new GatewayRouter({
      chatService: { sendMessage },
      defaultAgentId: "gateway-agent",
    });

    const result = await router.routeInbound({
      id: "in-1",
      channel: "whatsapp",
      conversationId: "+15550001111",
      userId: "+15550001111",
      text: "hey",
      timestamp: new Date().toISOString(),
    });

    expect(result.skipped).toBe(false);
    expect(result.runStatus).toBe("completed");
    expect(result.assistantText).toBe("hello from agent");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(
      "gateway-agent",
      expect.any(String),
      "hey",
    );
  });

  it("skips duplicate source message ids when deduper is enabled", async () => {
    const sendMessage = vi.fn(async () => ({
      session: { sessionId: "s1", messages: [] },
      run: { id: "run-1", status: "completed" as const },
    }));

    const router = new GatewayRouter({
      chatService: { sendMessage },
      deduper: new InboundDeduper(),
    });

    const inbound = {
      id: "in-1",
      channel: "whatsapp" as const,
      conversationId: "+15550001111",
      userId: "+15550001111",
      text: "same payload",
      timestamp: new Date().toISOString(),
      metadata: {
        sourceMessageId: "wamid.123",
      },
    };

    const first = await router.routeInbound(inbound);
    const second = await router.routeInbound(inbound);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

