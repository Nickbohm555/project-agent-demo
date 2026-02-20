import { describe, expect, it } from "vitest";
import { ChatEventBus } from "../../server/chat/chatEvents.js";

describe("ChatEventBus", () => {
  it("delivers events to subscribers of same session", () => {
    const bus = new ChatEventBus();
    const received: string[] = [];

    const unsubscribe = bus.subscribe("s1", (event) => {
      received.push(event.type);
    });

    bus.publish({
      sessionId: "s1",
      runId: "r1",
      type: "lifecycle",
      phase: "start",
      timestamp: new Date().toISOString(),
    });

    unsubscribe();

    expect(received).toEqual(["lifecycle"]);
  });

  it("stores tool log entries per session", () => {
    const bus = new ChatEventBus();

    bus.publish({
      sessionId: "s1",
      runId: "r1",
      type: "tool_call",
      toolName: "codex",
      text: "start",
      timestamp: new Date().toISOString(),
    });

    const entries = bus.getToolLog("s1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.toolName).toBe("codex");

    bus.clearToolLog("s1");
    expect(bus.getToolLog("s1")).toHaveLength(0);
  });
});
