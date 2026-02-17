import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRuntimeRequest, AgentRuntimeResponse } from "./types.js";

type PiSessionLike = {
  settings?: {
    model?: string;
  };
  messages?: Array<{ role: string; content: unknown }>;
};

// This adapter intentionally keeps the API surface small and resilient.
// It uses dynamic imports so the project can run even when PI setup is incomplete.
export class EmbeddedPiRuntime implements AgentRuntime {
  name = "embedded-pi";

  async run(input: AgentRuntimeRequest): Promise<AgentRuntimeResponse> {
    try {
      const piCodingAgent = (await import("@mariozechner/pi-coding-agent")) as Record<string, any>;
      const createAgentSession =
        typeof piCodingAgent.createAgentSession === "function"
          ? piCodingAgent.createAgentSession
          : null;

      if (!createAgentSession) {
        throw new Error("createAgentSession not found in @mariozechner/pi-coding-agent");
      }

      const session = (await createAgentSession({})) as PiSessionLike;
      session.settings = {
        ...(session.settings ?? {}),
        model: process.env.PI_MODEL ?? "gpt-4.1-mini",
      };

      session.messages = [
        ...(session.messages ?? []),
        ...input.conversation.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: "user", content: input.message },
      ];

      // In a full integration this would call the actual PI run/stream method.
      // For now, we emit a deterministic placeholder while preserving adapter boundaries.
      return {
        runId: randomUUID(),
        status: "completed",
        assistantText:
          "Embedded PI adapter is wired. Next step: call the real PI run API and stream tokens back to the UI.",
        diagnostics: {
          adapter: this.name,
          model: session.settings.model,
          note: "Scaffold mode",
        },
      };
    } catch (err) {
      return {
        runId: randomUUID(),
        status: "failed",
        assistantText: "Embedded PI runtime failed to initialize. Falling back is recommended.",
        diagnostics: {
          adapter: this.name,
          error: String(err),
        },
      };
    }
  }
}
