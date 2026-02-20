import type { ChatService } from "../../chat/chatService.js";
import type { InternalMessage } from "./message.js";
import type { InboundDeduper } from "./delivery.js";
import { ConversationSessionStore } from "./sessions.js";

type ChatServiceLike = Pick<ChatService, "sendMessage">;

export type GatewayRouteResult = {
  skipped: boolean;
  sessionId: string;
  runStatus: "completed" | "failed";
  assistantText?: string;
};

type GatewayRouterOptions = {
  chatService: ChatServiceLike;
  sessionStore?: ConversationSessionStore;
  deduper?: InboundDeduper;
  defaultAgentId?: string;
};

export class GatewayRouter {
  private sessionStore: ConversationSessionStore;
  private defaultAgentId: string;

  constructor(
    private options: GatewayRouterOptions,
  ) {
    this.sessionStore = options.sessionStore ?? new ConversationSessionStore();
    this.defaultAgentId = options.defaultAgentId ?? "gateway-agent";
  }

  async routeInbound(message: InternalMessage): Promise<GatewayRouteResult> {
    const sourceMessageId = message.metadata?.sourceMessageId;
    const sessionId = this.sessionStore.resolveSessionId(message.channel, message.conversationId);
    if (sourceMessageId && this.options.deduper?.has(sourceMessageId)) {
      return {
        skipped: true,
        sessionId,
        runStatus: "completed",
      };
    }

    if (sourceMessageId) {
      this.options.deduper?.mark(sourceMessageId);
    }

    const sendResult = await this.options.chatService.sendMessage(
      this.defaultAgentId,
      sessionId,
      message.text ?? "",
    );
    const assistantMessage = [...sendResult.session.messages]
      .reverse()
      .find((item) => item.role === "assistant");

    return {
      skipped: false,
      sessionId,
      runStatus: sendResult.run.status,
      assistantText: assistantMessage?.text,
    };
  }
}

