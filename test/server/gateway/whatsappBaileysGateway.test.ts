import { describe, expect, it } from "vitest";
import { __testing__, buildBaileysSocketConfig } from "../../../server/gateway/channels/whatsapp/baileysGateway.js";

describe("buildBaileysSocketConfig", () => {
  it("enables emitOwnEvents when self-chat mode is on", () => {
    const config = buildBaileysSocketConfig({
      creds: {},
      keys: {},
      keyStoreFactory: (keys) => ({ keys }),
      selfChatMode: true,
      version: [1, 2, 3],
    });

    expect(config.emitOwnEvents).toBe(true);
  });

  it("disables emitOwnEvents when self-chat mode is off", () => {
    const config = buildBaileysSocketConfig({
      creds: {},
      keys: {},
      keyStoreFactory: (keys) => ({ keys }),
      selfChatMode: false,
      version: [1, 2, 3],
    });

    expect(config.emitOwnEvents).toBe(false);
  });
});

describe("whatsapp gateway helpers", () => {
  it("filters recently sent messages within ttl", () => {
    const sent = new Map<string, number>([["msg-1", 1000]]);
    expect(__testing__.isRecentlySent(sent, 2000, "msg-1", 2500)).toBe(true);
    expect(__testing__.isRecentlySent(sent, 2000, "msg-1", 4001)).toBe(false);
  });

  it("prefixes outbound replies", () => {
    expect(__testing__.decorateReply("hello", "bohm-agent")).toBe("bohm-agent: hello");
  });

  it("trims streaming updates to a max length", () => {
    expect(__testing__.trimStreamText("  hello  ", 10)).toBe("hello");
    expect(__testing__.trimStreamText("a".repeat(20), 10)).toBe("aaaaaaa...");
  });
});
