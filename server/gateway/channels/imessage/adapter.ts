import type { ChannelAdapter, InternalMessage } from "../../core/message.js";
import { parseIMessageInbound } from "./inbound.js";
import { sendIMessageOutbound, type IMessageSender } from "./outbound.js";

export class IMessageAdapter implements ChannelAdapter {
  constructor(private send: IMessageSender) {}

  async parseInbound(payload: unknown): Promise<InternalMessage[]> {
    return parseIMessageInbound(payload);
  }

  async sendOutbound(message: InternalMessage) {
    return sendIMessageOutbound(message, this.send);
  }
}

