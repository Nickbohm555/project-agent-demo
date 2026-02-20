import { mkdir } from "node:fs/promises";
import type { GatewayRouter } from "../../core/router.js";
import { extractBaileysText, mapBaileysInbound } from "./baileysMessage.js";

type ConnectionStatus = {
  running: boolean;
  connected: boolean;
  reconnectAttempts: number;
  authDir: string;
  provider: "baileys";
};

type BaileysSocket = {
  ev: {
    on: (event: string, listener: (...args: unknown[]) => void | Promise<void>) => void;
  };
  sendMessage: (
    jid: string,
    content: { text: string },
  ) => Promise<{ key?: { id?: string } } | undefined>;
  end?: (error?: Error) => void;
  ws?: { close?: () => void };
  user?: { id?: string };
};

type BaileysModule = {
  DisconnectReason: {
    loggedOut: number;
  };
  fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
  makeCacheableSignalKeyStore: (keys: unknown, logger: unknown) => unknown;
  makeWASocket: (input: Record<string, unknown>) => BaileysSocket;
  useMultiFileAuthState: (
    authDir: string,
  ) => Promise<{ state: { creds: unknown; keys: unknown }; saveCreds: () => Promise<void> }>;
};

const silentBaileysLogger = {
  level: "silent",
  child() {
    return silentBaileysLogger;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

type WhatsAppBaileysGatewayOptions = {
  authDir: string;
  printQr: boolean;
  selfChatMode: boolean;
  gatewayRouter: GatewayRouter;
};

type QrCodeTerminal = {
  generate: (text: string, options?: { small?: boolean }) => void;
};

async function resolveQrTerminal(): Promise<QrCodeTerminal | null> {
  try {
    const module = (await import("qrcode-terminal")) as {
      default?: QrCodeTerminal;
      generate?: QrCodeTerminal["generate"];
    };
    if (module.default?.generate) {
      return module.default;
    }
    if (module.generate) {
      return { generate: module.generate };
    }
    return null;
  } catch (error) {
    console.warn(`[gateway/whatsapp] QR terminal unavailable: ${String(error)}`);
    return null;
  }
}

export class WhatsAppBaileysGateway {
  private socket: BaileysSocket | null = null;
  private runningLoop: Promise<void> | null = null;
  private stopRequested = false;
  private connected = false;
  private reconnectAttempts = 0;
  private qrTerminal: QrCodeTerminal | null = null;
  private sentMessageIds = new Map<string, number>();
  private sentMessageTtlMs = 2 * 60 * 1000;

  constructor(private options: WhatsAppBaileysGatewayOptions) {}

  async start(): Promise<void> {
    if (this.runningLoop) {
      return;
    }
    if (this.options.printQr) {
      this.qrTerminal = await resolveQrTerminal();
    }
    this.stopRequested = false;
    this.runningLoop = this.runLoop();
    await Promise.resolve();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.connected = false;
    this.socket?.end?.(new Error("whatsapp gateway stopped"));
    this.socket?.ws?.close?.();
    try {
      await this.runningLoop;
    } finally {
      this.runningLoop = null;
      this.socket = null;
      this.connected = false;
    }
  }

  getStatus(): ConnectionStatus {
    return {
      running: Boolean(this.runningLoop),
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      authDir: this.options.authDir,
      provider: "baileys",
    };
  }

  async sendText(jid: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error("WhatsApp Baileys socket is not connected");
    }
    const result = await this.socket.sendMessage(jid, { text });
    const messageId = result?.key?.id;
    if (messageId) {
      this.sentMessageIds.set(messageId, Date.now());
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        await this.connectOnce();
        this.reconnectAttempts = 0;
      } catch (error) {
        if (this.stopRequested) {
          break;
        }
        this.reconnectAttempts += 1;
        console.error(
          `[gateway/whatsapp] connection attempt failed (attempt=${this.reconnectAttempts}): ${String(
            error,
          )}`,
        );
      }

      if (this.stopRequested) {
        break;
      }

      const delayMs = Math.min(5_000, 500 * 2 ** Math.max(0, this.reconnectAttempts - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private async connectOnce(): Promise<void> {
    await mkdir(this.options.authDir, { recursive: true });
    const baileys = (await import("@whiskeysockets/baileys")) as unknown as BaileysModule;
    const { state, saveCreds } = await baileys.useMultiFileAuthState(this.options.authDir);
    const version = await this.resolveBaileysVersion(baileys);

    const socket = baileys.makeWASocket(
      buildBaileysSocketConfig({
        creds: state.creds,
        keys: state.keys,
        keyStoreFactory: (keys) => baileys.makeCacheableSignalKeyStore(keys, silentBaileysLogger),
        version,
        selfChatMode: this.options.selfChatMode,
      }),
    );
    this.socket = socket;

    socket.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error(`[gateway/whatsapp] failed to save creds: ${String(error)}`);
      }
    });
    socket.ev.on("messages.upsert", async (upsert: unknown) => {
      await this.handleMessagesUpsert(upsert);
    });

    await new Promise<void>((resolve, reject) => {
      socket.ev.on("connection.update", (update: unknown) => {
        const payload = update as {
          connection?: string;
          qr?: string;
          lastDisconnect?: { error?: { output?: { statusCode?: number } } };
        };

        if (payload.qr && this.options.printQr && this.qrTerminal) {
          console.log("[gateway/whatsapp] scan this WhatsApp QR code:");
          this.qrTerminal.generate(payload.qr, { small: true });
        } else if (payload.qr && this.options.printQr) {
          console.warn("[gateway/whatsapp] QR code available but qrcode-terminal is missing.");
        }

        if (payload.connection === "open") {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log("[gateway/whatsapp] connected");
          return;
        }

        if (payload.connection === "close") {
          this.connected = false;
          this.socket = null;

          const statusCode = payload.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === baileys.DisconnectReason.loggedOut) {
            this.stopRequested = true;
            reject(new Error("WhatsApp logged out. Re-link required."));
            return;
          }

          resolve();
        }
      });
    });
  }

  private async handleMessagesUpsert(upsert: unknown): Promise<void> {
    const payload = upsert as { messages?: Array<unknown> };
    const messages = payload.messages ?? [];
    console.log(
      `[gateway/whatsapp] upsert received messages=${messages.length} selfChatMode=${this.options.selfChatMode}`,
    );

    for (const rawMessage of messages) {
      const debug = rawMessage as {
        key?: { fromMe?: boolean; remoteJid?: string };
        message?: unknown;
      };
      const messageId = String((rawMessage as { key?: { id?: string } }).key?.id ?? "").trim();
      if (debug.key?.fromMe && messageId && this.isRecentlySent(messageId)) {
        console.log(`[gateway/whatsapp] skipping echo for messageId=${messageId}`);
        continue;
      }
      const extracted = extractBaileysText(debug as never);
      console.log(
        `[gateway/whatsapp] message fromMe=${Boolean(debug.key?.fromMe)} remoteJid=${debug.key?.remoteJid ?? "unknown"} textLen=${extracted.length}`,
      );
      const inbound = mapBaileysInbound(rawMessage as never, {
        selfChatMode: this.options.selfChatMode,
        selfJid: this.socket?.user?.id,
        debug: (reason, details) => {
          console.log(
            `[gateway/whatsapp] mapBaileysInbound drop reason=${reason} details=${JSON.stringify(details ?? {})}`,
          );
        },
      });
      if (!inbound) {
        console.log("[gateway/whatsapp] message filtered out by mapBaileysInbound");
        continue;
      }

      try {
        console.log(
          `[gateway/whatsapp] routing message to agent: conversationId=${inbound.conversationId} text="${inbound.text.slice(0, 80)}"`,
        );
        const routeResult = await this.options.gatewayRouter.routeInbound(inbound);
        console.log(
          `[gateway/whatsapp] route result: skipped=${routeResult.skipped} runStatus=${routeResult.runStatus} hasAssistantText=${Boolean(routeResult.assistantText)}`,
        );
        if (routeResult.skipped || !routeResult.assistantText) {
          continue;
        }
        const replyJid =
          (inbound.metadata as { replyToJid?: string } | undefined)?.replyToJid ??
          inbound.conversationId;
        await this.sendText(replyJid, this.decorateReply(routeResult.assistantText));
        console.log("[gateway/whatsapp] reply sent successfully");
      } catch (error) {
        console.error(
          `[gateway/whatsapp] error processing message: ${String(error)}`,
        );
      }
    }
  }

  private async resolveBaileysVersion(baileys: BaileysModule): Promise<number[] | undefined> {
    try {
      const latest = await baileys.fetchLatestBaileysVersion();
      return latest.version;
    } catch {
      return undefined;
    }
  }

  private isRecentlySent(messageId: string): boolean {
    return isRecentlySent(this.sentMessageIds, this.sentMessageTtlMs, messageId, Date.now());
  }

  private decorateReply(text: string): string {
    return decorateReply(text, "bohm-agent");
  }
}

export function isRecentlySent(
  sentMap: Map<string, number>,
  ttlMs: number,
  messageId: string,
  nowMs: number,
): boolean {
  const cutoff = nowMs - ttlMs;
  for (const [id, timestamp] of sentMap) {
    if (timestamp < cutoff) {
      sentMap.delete(id);
    }
  }
  const sentAt = sentMap.get(messageId);
  return typeof sentAt === "number" && sentAt >= cutoff;
}

export function decorateReply(text: string, prefix: string): string {
  return `${prefix}: ${text}`;
}

export const __testing__ = { isRecentlySent, decorateReply };

export function buildBaileysSocketConfig(input: {
  creds: unknown;
  keys: unknown;
  keyStoreFactory: (keys: unknown) => unknown;
  version?: number[];
  selfChatMode: boolean;
}): Record<string, unknown> {
  return {
    auth: {
      creds: input.creds,
      keys: input.keyStoreFactory(input.keys),
    },
    version: input.version,
    logger: silentBaileysLogger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    emitOwnEvents: input.selfChatMode,
    browser: ["project-agent-demo", "gateway", "1.0.0"],
  };
}
