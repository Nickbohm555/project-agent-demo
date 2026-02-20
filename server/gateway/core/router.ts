import type { ChatService } from "../../chat/chatService.js";
import type { ChatEventBus, ChatStreamEvent } from "../../chat/chatEvents.js";
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
  events?: ChatEventBus;
  sessionStore?: ConversationSessionStore;
  deduper?: InboundDeduper;
  defaultAgentId?: string;
};

export class GatewayRouter {
  private sessionStore: ConversationSessionStore;
  private defaultAgentId: string;
  private events?: ChatEventBus;

  constructor(
    private options: GatewayRouterOptions,
  ) {
    this.sessionStore = options.sessionStore ?? new ConversationSessionStore();
    this.defaultAgentId = options.defaultAgentId ?? "gateway-agent";
    this.events = options.events;
  }

  async routeInbound(
    message: InternalMessage,
    options?: { onEvent?: (event: ChatStreamEvent) => void },
  ): Promise<GatewayRouteResult> {
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

    let unsubscribe: (() => void) | null = null;
    if (options?.onEvent && this.events) {
      let activeRunId: string | null = null;
      unsubscribe = this.events.subscribe(sessionId, (event) => {
        if (!activeRunId && event.type === "lifecycle" && event.phase === "start") {
          activeRunId = event.runId;
        }
        if (activeRunId && event.runId !== activeRunId) {
          return;
        }
        options.onEvent?.(event);
      });
    }

    let sendResult;
    try {
      sendResult = await this.options.chatService.sendMessage(
        this.defaultAgentId,
        sessionId,
        message.text ?? "",
      );
    } finally {
      unsubscribe?.();
    }
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
