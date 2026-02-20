import type { DeliveryResult, InternalMessage } from "../../core/message.js";
import { mapWhatsAppOutbound, type WhatsAppOutboundPayload } from "./mapper.js";

export type WhatsAppSender = (payload: WhatsAppOutboundPayload) => Promise<{
  messageId: string;
}>;

export async function sendWhatsAppOutbound(
  message: InternalMessage,
  send: WhatsAppSender,
): Promise<DeliveryResult> {
  const payload = mapWhatsAppOutbound(message);
  const result = await send(payload);
  return { providerMessageId: result.messageId };
}

