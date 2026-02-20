import { randomUUID } from "node:crypto";
import type { GatewayChannel } from "./message.js";

type SessionRecord = {
  channel: GatewayChannel;
  conversationId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
};

export class ConversationSessionStore {
  private records = new Map<string, SessionRecord>();

  resolveSessionId(channel: GatewayChannel, conversationId: string): string {
    const key = this.buildKey(channel, conversationId);
    const existing = this.records.get(key);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      return existing.sessionId;
    }

    const now = new Date().toISOString();
    const record: SessionRecord = {
      channel,
      conversationId,
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return record.sessionId;
  }

  list(): SessionRecord[] {
    return Array.from(this.records.values());
  }

  private buildKey(channel: GatewayChannel, conversationId: string): string {
    return `${channel}:${conversationId}`;
  }
}

