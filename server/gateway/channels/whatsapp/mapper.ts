import { randomUUID } from "node:crypto";
import type { InternalMessage } from "../../core/message.js";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

export function mapWhatsAppInbound(payload: WhatsAppWebhookPayload): InternalMessage[] {
  const nowIso = new Date().toISOString();
  const mapped: InternalMessage[] = [];
  const entries = payload.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const rawMessage of change.value?.messages ?? []) {
        if (rawMessage.type !== "text") {
          continue;
        }

        const from = String(rawMessage.from ?? "").trim();
        const text = String(rawMessage.text?.body ?? "").trim();
        if (!from || !text) {
          continue;
        }

        mapped.push({
          id: rawMessage.id ?? randomUUID(),
          channel: "whatsapp",
          conversationId: from,
          userId: from,
          text,
          timestamp: rawMessage.timestamp ?? nowIso,
          metadata: {
            sourceMessageId: rawMessage.id,
            provider: "whatsapp-cloud-api",
          },
        });
      }
    }
  }

  return mapped;
}

export type WhatsAppOutboundPayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
};

export function mapWhatsAppOutbound(message: InternalMessage): WhatsAppOutboundPayload {
  return {
    messaging_product: "whatsapp",
    to: message.conversationId,
    type: "text",
    text: {
      body: message.text ?? "",
    },
  };
}

