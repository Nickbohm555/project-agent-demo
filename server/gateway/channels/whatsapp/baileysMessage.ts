import { randomUUID } from "node:crypto";
import type { proto } from "@whiskeysockets/baileys";
import { extractMessageContent, normalizeMessageContent } from "@whiskeysockets/baileys";
import type { InternalMessage } from "../../core/message.js";

type BaileysIncoming = {
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    participant?: string;
  };
  message?: unknown;
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

function unwrapMessage(message: proto.IMessage | undefined): proto.IMessage | undefined {
  return normalizeMessageContent(message);
}

export function extractBaileysText(raw: BaileysIncoming): string {
  const message = unwrapMessage(raw.message as proto.IMessage | undefined);
  if (!message) {
    return "";
  }
  const extracted = extractMessageContent(message);
  const candidates: Array<proto.IMessage | undefined> = [
    message,
    extracted && extracted !== message ? (extracted as proto.IMessage) : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (typeof candidate.conversation === "string" && candidate.conversation.trim()) {
      return candidate.conversation.trim();
    }
    const extended = candidate.extendedTextMessage?.text;
    if (extended?.trim()) {
      return extended.trim();
    }
    const caption =
      candidate.imageMessage?.caption ??
      candidate.videoMessage?.caption ??
      candidate.documentMessage?.caption;
    if (caption?.trim()) {
      return caption.trim();
    }
  }

  return "";
}

export function mapBaileysInbound(
  raw: BaileysIncoming,
  options: {
    selfChatMode?: boolean;
    selfJid?: string | null;
    debug?: (reason: string, details?: Record<string, unknown>) => void;
  } = {},
): InternalMessage | null {
  if (raw.key?.fromMe && !options.selfChatMode) {
    options.debug?.("fromMe_filtered", { selfChatMode: options.selfChatMode });
    return null;
  }

  const remoteJid = String(raw.key?.remoteJid ?? "").trim();
  if (!remoteJid) {
    options.debug?.("missing_remote_jid");
    return null;
  }
  const conversationId =
    options.selfChatMode && options.selfJid && remoteJid.endsWith("@lid")
      ? options.selfJid
      : remoteJid;

  const text = extractBaileysText(raw);
  if (!text) {
    options.debug?.("missing_text", { remoteJid });
    return null;
  }

  const sourceId = String(raw.key?.id ?? "").trim();
  const userId = String(raw.key?.participant ?? conversationId ?? "").trim();
  if (!userId) {
    options.debug?.("missing_user_id", { remoteJid, conversationId });
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
