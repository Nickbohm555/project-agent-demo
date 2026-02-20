import { EventEmitter } from "node:events";

export type ChatStreamEvent = {
  sessionId: string;
  runId: string;
  type: "lifecycle" | "assistant_delta" | "tool_call" | "tool_output";
  phase?: "start" | "end" | "error";
  text?: string;
  toolName?: string;
  timestamp: string;
};

export type ToolLogEntry = {
  id: string;
  sessionId: string;
  runId: string;
  kind: "call" | "output";
  toolName: string;
  text: string;
  timestamp: string;
};

export class ChatEventBus {
  private emitter = new EventEmitter();
  private toolLog = new Map<string, ToolLogEntry[]>();
  private toolLogLimit = 200;

  publish(event: ChatStreamEvent) {
    if (event.type === "tool_call" || event.type === "tool_output") {
      const toolName = event.toolName ?? "unknown";
      const text = event.text ?? "";
      const entry: ToolLogEntry = {
        id: `${event.runId}-${event.type}-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: event.sessionId,
        runId: event.runId,
        kind: event.type === "tool_call" ? "call" : "output",
        toolName,
        text,
        timestamp: event.timestamp,
      };
      const current = this.toolLog.get(event.sessionId) ?? [];
      const next = [...current, entry].slice(-this.toolLogLimit);
      this.toolLog.set(event.sessionId, next);
    }
    this.emitter.emit(event.sessionId, event);
  }

  subscribe(sessionId: string, listener: (event: ChatStreamEvent) => void): () => void {
    this.emitter.on(sessionId, listener);
    return () => this.emitter.off(sessionId, listener);
  }

  getToolLog(sessionId: string): ToolLogEntry[] {
    return this.toolLog.get(sessionId) ?? [];
  }

  clearToolLog(sessionId: string): void {
    this.toolLog.delete(sessionId);
  }
}
