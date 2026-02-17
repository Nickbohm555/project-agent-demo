import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRuntimeRequest, AgentRuntimeResponse } from "./types.js";

export class MockAgentRuntime implements AgentRuntime {
  name = "mock";

  async run(input: AgentRuntimeRequest): Promise<AgentRuntimeResponse> {
    const summary = input.conversation
      .slice(-3)
      .map((item) => `${item.role}: ${item.text}`)
      .join(" | ");

    return {
      runId: randomUUID(),
      status: "completed",
      assistantText: [
        "This is a mock runtime response.",
        `You said: ${input.message}`,
        summary ? `Recent context: ${summary}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      diagnostics: {
        adapter: this.name,
        contextSize: input.conversation.length,
      },
    };
  }
}
