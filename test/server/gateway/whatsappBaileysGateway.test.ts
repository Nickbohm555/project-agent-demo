import { describe, expect, it } from "vitest";
import { buildBaileysSocketConfig } from "../../../server/gateway/channels/whatsapp/baileysGateway.js";

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
