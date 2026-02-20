import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
};

function extractTextFromResult(result: ToolResult | undefined): string | undefined {
  const chunks = Array.isArray(result?.content) ? result.content : [];
  const text = chunks
    .map((chunk) => (chunk?.type === "text" && typeof chunk.text === "string" ? chunk.text : ""))
    .filter(Boolean)
    .join("");
  return text || undefined;
}

export function getToolOutputText(event: AgentSessionEvent): string | undefined {
  if (event.type === "tool_execution_update") {
    return extractTextFromResult((event as { partialResult?: ToolResult }).partialResult);
  }
  if (event.type === "tool_execution_end") {
    return extractTextFromResult((event as { result?: ToolResult }).result);
  }
  return undefined;
}
