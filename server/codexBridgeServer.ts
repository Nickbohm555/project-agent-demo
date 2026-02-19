import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadEnvironmentFromDotenv } from "./config/load-env.js";
import { createCodexTool } from "./agent/codexTool.js";
import { CodexSessionStore } from "./agent/codexSessionStore.js";

const requestSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(["start", "continue", "stop", "status"]),
  prompt: z.string().optional(),
});

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value === "") {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function bridgeLog(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  if (!envFlag("PI_LOG_CODEX_TOOL", true)) {
    return;
  }
  const line = `[codex-bridge] ${event} ${JSON.stringify(details)}`;
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

const app = express();
const envResult = loadEnvironmentFromDotenv();
const port = Number(process.env.PI_CODEX_BRIDGE_PORT ?? 43319);
const codexWorkdir = process.env.PI_CODEX_WORKDIR?.trim() || process.cwd();
const sessionStore = new CodexSessionStore();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, codexWorkdir });
});

app.post("/execute", async (req, res) => {
  const requestId = `codex-bridge-${randomUUID()}`;
  bridgeLog("info", "request.received", {
    requestId,
    body: req.body ?? null,
  });

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    bridgeLog("warn", "request.invalid", {
      requestId,
      issues: parsed.error.issues,
    });
    res.status(400).json({ ok: false, error: "Invalid codex bridge payload", details: parsed.error.issues });
    return;
  }

  const { sessionId, action, prompt } = parsed.data;
  const codexTool = createCodexTool({
    defaultCwd: codexWorkdir,
    threadId: sessionId,
    sessionStore,
  });

  try {
    const streamChunks: string[] = [];
    const result = await codexTool.execute(
      `bridge-${randomUUID()}`,
      { action, prompt },
      undefined,
      (update) => {
        const chunk = extractTextContent(update.content as Array<{ type?: string; text?: string }> | undefined);
        if (chunk) {
          streamChunks.push(chunk);
        }
      },
      undefined as never,
    );

    const text = extractTextContent(result.content as Array<{ type?: string; text?: string }> | undefined);
    const streamText = streamChunks.join("");
    const details = (result.details as Record<string, unknown> | undefined) ?? null;

    bridgeLog("info", "request.done", {
      requestId,
      sessionId,
      action,
      textChars: text.length,
      streamTextChars: streamText.length,
    });

    res.json({
      ok: true,
      sessionId,
      action,
      text,
      streamText,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    bridgeLog("error", "request.error", {
      requestId,
      sessionId,
      action,
      error: String(err),
    });
    res.status(500).json({
      ok: false,
      error: "Codex bridge execution failed",
      details: String(err),
    });
  }
});

app.listen(port, () => {
  console.log(
    `[codex-bridge] listening on http://127.0.0.1:${port} (dotenv=${envResult.loaded ? "loaded" : "missing"}, codexWorkdir=${codexWorkdir})`,
  );
});
