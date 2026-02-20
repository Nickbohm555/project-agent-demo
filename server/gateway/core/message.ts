import { z } from "zod";

export const channelSchema = z.enum(["chat", "terminal", "whatsapp", "imessage"]);
export type GatewayChannel = z.infer<typeof channelSchema>;

export const attachmentSchema = z.object({
  type: z.string().min(1),
  url: z.string().min(1),
});
export type GatewayAttachment = z.infer<typeof attachmentSchema>;

export const internalMessageSchema = z.object({
  id: z.string().min(1),
  channel: channelSchema,
  conversationId: z.string().min(1),
  userId: z.string().min(1),
  text: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  timestamp: z.string().min(1),
  metadata: z
    .object({
      sourceMessageId: z.string().optional(),
      provider: z.string().optional(),
    })
    .optional(),
});
export type InternalMessage = z.infer<typeof internalMessageSchema>;

export type DeliveryResult = {
  providerMessageId: string;
};

export interface ChannelAdapter {
  parseInbound(payload: unknown): Promise<InternalMessage[]>;
  sendOutbound(message: InternalMessage): Promise<DeliveryResult>;
}

