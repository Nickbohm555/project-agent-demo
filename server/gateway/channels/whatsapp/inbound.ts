import type { InternalMessage } from "../../core/message.js";
import { mapWhatsAppInbound } from "./mapper.js";

export function parseWhatsAppInbound(payload: unknown): InternalMessage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  return mapWhatsAppInbound(payload);
}

