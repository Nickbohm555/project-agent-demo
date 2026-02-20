import { describe, expect, it } from "vitest";
import {
  extractBaileysText,
  mapBaileysInbound,
} from "../../../server/gateway/channels/whatsapp/baileysMessage.js";

describe("extractBaileysText", () => {
  it("extracts conversation text and trims whitespace", () => {
    expect(
      extractBaileysText({
        message: {
          conversation: "  hello from whatsapp  ",
        },
      }),
    ).toBe("hello from whatsapp");
  });
});

describe("mapBaileysInbound", () => {
  it("maps supported inbound payload to internal message", () => {
    const mapped = mapBaileysInbound({
      key: {
        id: "BAE5123",
        fromMe: false,
        remoteJid: "15550001111@s.whatsapp.net",
      },
      message: {
        extendedTextMessage: { text: "hi from phone" },
      },
      messageTimestamp: 1_700_000_000,
    });

    expect(mapped).toMatchObject({
      id: "BAE5123",
      channel: "whatsapp",
      conversationId: "15550001111@s.whatsapp.net",
      userId: "15550001111@s.whatsapp.net",
      text: "hi from phone",
    });
    expect(mapped?.metadata?.provider).toBe("baileys");
  });

  it("ignores outbound/empty messages", () => {
    expect(
      mapBaileysInbound({
        key: {
          id: "BAE1",
          fromMe: true,
          remoteJid: "15550001111@s.whatsapp.net",
        },
        message: {
          conversation: "this should be ignored",
        },
      }),
    ).toBeNull();
  });

  it("allows self-chat messages when enabled for lid chats", () => {
    const mapped = mapBaileysInbound(
      {
        key: {
          id: "BAE2",
          fromMe: true,
          remoteJid: "219739787915460@lid",
        },
        message: {
          conversation: "self chat ok",
        },
        messageTimestamp: 1_700_000_123,
      },
      { selfChatMode: true, selfJid: "15550001111@s.whatsapp.net" },
    );

    expect(mapped).toMatchObject({
      id: "BAE2",
      channel: "whatsapp",
      conversationId: "15550001111@s.whatsapp.net",
      userId: "15550001111@s.whatsapp.net",
      text: "self chat ok",
    });
  });

  it("uses self jid for lid conversations in self-chat mode", () => {
    const mapped = mapBaileysInbound(
      {
        key: {
          id: "BAE3",
          fromMe: true,
          remoteJid: "219739787915460@lid",
        },
        message: {
          conversation: "self chat lid",
        },
      },
      { selfChatMode: true, selfJid: "15550001111@s.whatsapp.net" },
    );

    expect(mapped).toMatchObject({
      conversationId: "15550001111@s.whatsapp.net",
      userId: "15550001111@s.whatsapp.net",
    });
  });

  it("extracts text from wrapped messages", () => {
    const mapped = mapBaileysInbound(
      {
        key: {
          id: "BAE4",
          fromMe: false,
          remoteJid: "15550001111@s.whatsapp.net",
        },
        message: {
          ephemeralMessage: {
            message: {
              extendedTextMessage: { text: "wrapped text" },
            },
          },
        },
      },
      { selfChatMode: false },
    );

    expect(mapped?.text).toBe("wrapped text");
  });

  it("falls back to conversation id when participant is blank", () => {
    const mapped = mapBaileysInbound(
      {
        key: {
          id: "BAE5",
          fromMe: false,
          remoteJid: "15550001111@s.whatsapp.net",
          participant: "",
        },
        message: {
          conversation: "self chat",
        },
      },
      { selfChatMode: true },
    );

    expect(mapped?.userId).toBe("15550001111@s.whatsapp.net");
  });

  it("filters self-chat echoes for non-lid remote jids", () => {
    const mapped = mapBaileysInbound(
      {
        key: {
          id: "BAE6",
          fromMe: true,
          remoteJid: "15550001111@s.whatsapp.net",
        },
        message: {
          conversation: "echo message",
        },
      },
      { selfChatMode: true, selfJid: "15550001111@s.whatsapp.net" },
    );

    expect(mapped).toBeNull();
  });
});
