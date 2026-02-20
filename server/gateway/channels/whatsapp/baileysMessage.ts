import { randomUUID } from "node:crypto";
import type { InternalMessage } from "../../core/message.js";

type BaileysIncoming = {
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
  };
  messageTimestamp?: number | LongLike;
};

type LongLike = {
  toString?: () => string;
};

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (value && typeof value === "object") {
    const text = (value as LongLike).toString?.();
    if (text && /^-?\d+$/.test(text)) {
      const seconds = Number(text);
      if (Number.isFinite(seconds)) {
        return new Date(seconds * 1000).toISOString();
      }
    }
  }
  return new Date().toISOString();
}

export function extractBaileysText(raw: BaileysIncoming): string {
  return String(
    raw.message?.conversation ??
      raw.message?.extendedTextMessage?.text ??
      raw.message?.imageMessage?.caption ??
      raw.message?.videoMessage?.caption ??
      "",
  ).trim();
}

export function mapBaileysInbound(
  raw: BaileysIncoming,
  options: { selfChatMode?: boolean } = {},
): InternalMessage | null {
  if (raw.key?.fromMe && !options.selfChatMode) {
    return null;
  }

  const conversationId = String(raw.key?.remoteJid ?? "").trim();
  if (!conversationId) {
    return null;
  }

  const text = extractBaileysText(raw);
  if (!text) {
    return null;
  }

  const sourceId = String(raw.key?.id ?? "").trim();
  const userId = String(raw.key?.participant ?? raw.key?.remoteJid ?? "").trim();
  if (!userId) {
    return null;
  }

  return {
    id: sourceId || randomUUID(),
    channel: "whatsapp",
    conversationId,
    userId,
    text,
    timestamp: normalizeTimestamp(raw.messageTimestamp),
    metadata: {
      sourceMessageId: sourceId || undefined,
      provider: "baileys",
    },
  };
}
