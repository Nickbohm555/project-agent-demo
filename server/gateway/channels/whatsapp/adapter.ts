import type { ChannelAdapter, InternalMessage } from "../../core/message.js";
import { parseWhatsAppInbound } from "./inbound.js";
import { sendWhatsAppOutbound, type WhatsAppSender } from "./outbound.js";

export class WhatsAppAdapter implements ChannelAdapter {
  constructor(private send: WhatsAppSender) {}

  async parseInbound(payload: unknown): Promise<InternalMessage[]> {
    return parseWhatsAppInbound(payload);
  }

  async sendOutbound(message: InternalMessage) {
    return sendWhatsAppOutbound(message, this.send);
  }
}

