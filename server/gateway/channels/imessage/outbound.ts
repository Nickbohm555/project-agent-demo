import type { DeliveryResult, InternalMessage } from "../../core/message.js";

export type IMessageSender = (payload: {
  conversationId: string;
  text: string;
}) => Promise<{ messageId: string }>;

export async function sendIMessageOutbound(
  message: InternalMessage,
  send: IMessageSender,
): Promise<DeliveryResult> {
  const result = await send({
    conversationId: message.conversationId,
    text: message.text ?? "",
  });
  return { providerMessageId: result.messageId };
}

