import { EventEmitter } from "node:events";

export type ChatStreamEvent = {
  sessionId: string;
  runId: string;
  type: "lifecycle" | "assistant_delta" | "tool_output";
  phase?: "start" | "end" | "error";
  text?: string;
  toolName?: string;
  timestamp: string;
};

export class ChatEventBus {
  private emitter = new EventEmitter();

  publish(event: ChatStreamEvent) {
    this.emitter.emit(event.sessionId, event);
  }

  subscribe(sessionId: string, listener: (event: ChatStreamEvent) => void): () => void {
    this.emitter.on(sessionId, listener);
    return () => this.emitter.off(sessionId, listener);
  }
}
