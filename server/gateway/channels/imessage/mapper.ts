import { randomUUID } from "node:crypto";
import type { InternalMessage } from "../../core/message.js";

type IMessageInboundPayload = {
  id?: string;
  conversationId?: string;
  userId?: string;
  text?: string;
  timestamp?: string;
};

export function mapIMessageInbound(payload: IMessageInboundPayload): InternalMessage[] {
  const conversationId = String(payload.conversationId ?? "").trim();
  const userId = String(payload.userId ?? "").trim();
  const text = String(payload.text ?? "").trim();
  if (!conversationId || !userId || !text) {
    return [];
  }

  return [
    {
      id: payload.id ?? randomUUID(),
      channel: "imessage",
      conversationId,
      userId,
      text,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      metadata: {
        sourceMessageId: payload.id,
        provider: "imessage-bridge",
      },
    },
  ];
}

