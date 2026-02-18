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
});
