import { describe, expect, it } from "vitest";
import {
  mapWhatsAppInbound,
  mapWhatsAppOutbound,
} from "../../../server/gateway/channels/whatsapp/mapper.js";

describe("mapWhatsAppInbound", () => {
  it("maps WhatsApp text messages into internal messages", () => {
    const mapped = mapWhatsAppInbound({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.abc123",
                    from: "15550001111",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "hello" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      id: "wamid.abc123",
      channel: "whatsapp",
      conversationId: "15550001111",
      userId: "15550001111",
      text: "hello",
    });
    expect(mapped[0]?.metadata?.provider).toBe("whatsapp-cloud-api");
  });
});

describe("mapWhatsAppOutbound", () => {
  it("maps internal messages to WhatsApp Cloud API send shape", () => {
    const outbound = mapWhatsAppOutbound({
      id: "out-1",
      channel: "whatsapp",
      conversationId: "15550001111",
      userId: "assistant",
      text: "reply",
      timestamp: new Date().toISOString(),
    });

    expect(outbound).toEqual({
      messaging_product: "whatsapp",
      to: "15550001111",
      type: "text",
      text: { body: "reply" },
    });
  });
});

