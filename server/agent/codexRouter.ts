import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createCodexTool } from "./codexTool.js";
import type { AgentToolConfig } from "./toolConfig.js";
import { getCodexSessionStore } from "./toolConfig.js";

const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(["start", "continue", "stop", "status"]),
  prompt: z.string().optional(),
});

type CodexRouteExecuteInput = {
  sessionId: string;
  action: "start" | "continue" | "stop" | "status";
  prompt?: string;
  toolConfig: AgentToolConfig;
};

type CodexRouteExecuteResult = {
  text: string;
  streamText: string;
  details: Record<string, unknown> | null;
};

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value === "") {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function codexRouteLog(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  if (!envFlag("PI_LOG_CODEX_TOOL", true)) {
    return;
  }
  const line = `[codex-router] ${event} ${JSON.stringify(details)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function extractTextContent(content: Array<{ type?: string; text?: string }> | undefined): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => (item?.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function executeCodexAction(input: CodexRouteExecuteInput): Promise<CodexRouteExecuteResult> {
  const startedAtMs = Date.now();
  const requestId = `codex-route-${randomUUID()}`;
  const streamChunks: string[] = [];
  let streamChunkCount = 0;
  let streamCharCount = 0;

  codexRouteLog("info", "execute.start", {
    requestId,
    sessionId: input.sessionId,
    action: input.action,
    prompt: input.prompt ?? null,
    promptChars: (input.prompt ?? "").length,
    codexWorkdir: input.toolConfig.codexWorkdir,
  });

  const codexTool = createCodexTool({
    defaultCwd: input.toolConfig.codexWorkdir,
    threadId: input.sessionId,
    sessionStore: getCodexSessionStore(),
  });

  const result = await codexTool.execute(
    `api-${randomUUID()}`,
    { action: input.action, prompt: input.prompt },
    undefined,
    (update) => {
      const chunk = extractTextContent(update.content as Array<{ type?: string; text?: string }> | undefined);
      if (chunk) {
        streamChunkCount += 1;
        streamCharCount += chunk.length;
        streamChunks.push(chunk);
        codexRouteLog("info", "execute.stream", {
          requestId,
          sessionId: input.sessionId,
          action: input.action,
          chunkIndex: streamChunkCount,
          chunkChars: chunk.length,
          totalStreamChars: streamCharCount,
          chunkPreview: chunk.slice(0, 200),
        });
      }
    },
    undefined as never,
  );

  const text = extractTextContent(result.content as Array<{ type?: string; text?: string }> | undefined);
  const streamText = streamChunks.join("");
  const details = (result.details as Record<string, unknown> | undefined) ?? null;

  codexRouteLog("info", "execute.done", {
    requestId,
    sessionId: input.sessionId,
    action: input.action,
    prompt: input.prompt ?? null,
    promptChars: (input.prompt ?? "").length,
    streamChunkCount,
    streamCharCount,
    outputChars: text.length,
    elapsedMs: Date.now() - startedAtMs,
  });

  return {
    text,
    streamText,
    details,
  };
}

export function buildCodexRouter(
  toolConfig: AgentToolConfig,
  options?: {
    execute?: (input: CodexRouteExecuteInput) => Promise<CodexRouteExecuteResult>;
  },
): Router {
  const router = Router();
  const execute = options?.execute ?? executeCodexAction;

  router.post("/execute", async (req, res) => {
    const httpRequestId = `http-${randomUUID()}`;
    codexRouteLog("info", "http.request.received", {
      httpRequestId,
      body: req.body ?? null,
      bodyType: typeof req.body,
    });

    const parsed = executeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      codexRouteLog("warn", "http.request.invalid", {
        httpRequestId,
        issues: parsed.error.issues,
      });
      res.status(400).json({ error: "Invalid codex request payload", details: parsed.error.issues });
      return;
    }

    if (!toolConfig.codexToolEnabled) {
      codexRouteLog("warn", "http.request.disabled", {
        httpRequestId,
        sessionId: parsed.data.sessionId,
        action: parsed.data.action,
      });
      res.status(409).json({
        error: "Codex tool is disabled",
        details: "Set PI_ENABLE_CODEX_TOOL=true to enable Codex terminal actions.",
      });
      return;
    }

    const { sessionId, action, prompt } = parsed.data;

    try {
      codexRouteLog("info", "http.execute.start", {
        httpRequestId,
        sessionId,
        action,
        prompt: prompt ?? null,
        promptChars: (prompt ?? "").length,
      });
      const result = await execute({
        sessionId,
        action,
        prompt,
        toolConfig,
      });
      res.json({
        ok: true,
        sessionId,
        action,
        text: result.text,
        streamText: result.streamText,
        details: result.details,
        timestamp: new Date().toISOString(),
      });
      codexRouteLog("info", "http.execute.done", {
        httpRequestId,
        sessionId,
        action,
        prompt: prompt ?? null,
        promptChars: (prompt ?? "").length,
        textChars: result.text.length,
        streamTextChars: result.streamText.length,
      });
    } catch (err) {
      codexRouteLog("error", "http.execute.error", {
        httpRequestId,
        sessionId,
        action,
        prompt: prompt ?? null,
        promptChars: (prompt ?? "").length,
        error: String(err),
      });
      res.status(500).json({
        error: "Failed to execute codex action",
        details: String(err),
      });
    }
  });

  return router;
}
