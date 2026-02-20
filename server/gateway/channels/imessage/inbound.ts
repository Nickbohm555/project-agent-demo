import type { InternalMessage } from "../../core/message.js";
import { mapIMessageInbound } from "./mapper.js";

export function parseIMessageInbound(payload: unknown): InternalMessage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  return mapIMessageInbound(payload);
}

