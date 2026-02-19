import cors from "cors";
import express from "express";
import { loadEnvironmentFromDotenv } from "./config/load-env.js";
import { buildCodexRouter } from "./agent/codexRouter.js";
import { buildRuntimeContext } from "./agent/runtimeFactory.js";
import { getConfiguredToolNames, getToolCatalog } from "./agent/toolConfig.js";
import { ChatEventBus } from "./chat/chatEvents.js";
import { ChatService } from "./chat/chatService.js";
import { buildChatRouter } from "./chat/chatRouter.js";
import { resolveApiPort } from "../config/ports.js";

const app = express();
const port = resolveApiPort();
const envResult = loadEnvironmentFromDotenv();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const { runtime, sessionStore, modelConfig, toolConfig } = buildRuntimeContext();
const configuredTools = getConfiguredToolNames(toolConfig);
const toolCatalog = getToolCatalog(toolConfig);
const loggingFlags = {
  PI_LOG_EVENTS: process.env.PI_LOG_EVENTS ?? "false",
  PI_LOG_ASSISTANT_DELTAS: process.env.PI_LOG_ASSISTANT_DELTAS ?? "false",
  PI_LOG_TOOL_EVENTS: process.env.PI_LOG_TOOL_EVENTS ?? "false",
  PI_LOG_RAW_EVENTS: process.env.PI_LOG_RAW_EVENTS ?? "false",
  PI_LOG_CODEX_TOOL: process.env.PI_LOG_CODEX_TOOL ?? "true",
};
const eventBus = new ChatEventBus();
const chatService = new ChatService(runtime, eventBus);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    runtime: runtime.name,
    model: `${modelConfig.provider}/${modelConfig.modelId}`,
    thinkingLevel: modelConfig.thinkingLevel,
    hasRequiredApiKey: modelConfig.hasRequiredApiKey,
    cliToolEnabled: toolConfig.cliToolEnabled,
    codexToolEnabled: toolConfig.codexToolEnabled,
  });
});

app.get("/api/agents/sessions", (_req, res) => {
  res.json({ sessions: sessionStore.list() });
});

app.get("/api/agent/runtime", (_req, res) => {
  res.json({
    runtime: runtime.name,
    modelConfig,
    toolConfig,
    configuredTools,
    toolCatalog,
    loggingFlags,
  });
});

app.use("/api/chat", buildChatRouter(chatService, eventBus));
app.use("/api/codex", buildCodexRouter(toolConfig));

app.listen(port, () => {
  console.log(
    `[project-agent-demo] server listening on http://localhost:${port} (runtime=${runtime.name}, dotenv=${envResult.loaded ? "loaded" : "missing"})`,
  );
  console.log(
    `[project-agent-demo] tools configured: ${configuredTools.length > 0 ? configuredTools.join(", ") : "none"} | cliWorkdir=${toolConfig.cliWorkdir} codexWorkdir=${toolConfig.codexWorkdir}`,
  );
  console.log(`[project-agent-demo] logging flags: ${JSON.stringify(loggingFlags)}`);
});
