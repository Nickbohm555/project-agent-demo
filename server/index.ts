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
import { installOutboundRequestLogger } from "./agent/httpLogging.js";
import { loadGatewayConfig } from "./gateway/config.js";
import { GatewayRouter } from "./gateway/core/router.js";
import { ConversationSessionStore } from "./gateway/core/sessions.js";
import { InboundDeduper } from "./gateway/core/delivery.js";
import { buildWhatsAppWebhookRouter } from "./gateway/api/webhooks/whatsapp.js";
import { WhatsAppBaileysGateway } from "./gateway/channels/whatsapp/baileysGateway.js";

const app = express();
const port = resolveApiPort();
const envResult = loadEnvironmentFromDotenv();
installOutboundRequestLogger();

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
  PI_LOG_PROVIDER_HEADERS: process.env.PI_LOG_PROVIDER_HEADERS ?? "true",
  PI_LOG_CODEX_ENV: process.env.PI_LOG_CODEX_ENV ?? "true",
};
const eventBus = new ChatEventBus();
const chatService = new ChatService(runtime, eventBus, modelConfig);
const gatewayConfig = loadGatewayConfig();
const gatewayRouter = new GatewayRouter({
  chatService,
  sessionStore: new ConversationSessionStore(),
  deduper: new InboundDeduper(),
  defaultAgentId: "gateway-agent",
});
const whatsappBaileysGateway =
  gatewayConfig.whatsapp.enabled && gatewayConfig.whatsapp.provider === "baileys"
    ? new WhatsAppBaileysGateway({
        authDir: gatewayConfig.whatsapp.authDir,
        printQr: gatewayConfig.whatsapp.printQr,
        selfChatMode: gatewayConfig.whatsapp.selfChatMode,
        gatewayRouter,
      })
    : null;

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    runtime: runtime.name,
    model: `${modelConfig.provider}/${modelConfig.modelId}`,
    thinkingLevel: modelConfig.thinkingLevel,
    hasRequiredApiKey: modelConfig.hasRequiredApiKey,
    cliToolEnabled: toolConfig.cliToolEnabled,
    codexToolEnabled: toolConfig.codexToolEnabled,
    whatsappGateway: {
      enabled: gatewayConfig.whatsapp.enabled,
      provider: gatewayConfig.whatsapp.provider,
      status: whatsappBaileysGateway?.getStatus() ?? null,
    },
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
app.use("/api/codex", buildCodexRouter(toolConfig, { events: eventBus }));
if (gatewayConfig.whatsapp.enabled && gatewayConfig.whatsapp.provider === "cloud-api") {
  app.use(
    "/api/webhooks/whatsapp",
    buildWhatsAppWebhookRouter({
      gatewayRouter,
      verifyToken: gatewayConfig.whatsapp.verifyToken ?? undefined,
    }),
  );
}

app.listen(port, () => {
  console.log(
    `[project-agent-demo] server listening on http://localhost:${port} (runtime=${runtime.name}, dotenv=${envResult.loaded ? "loaded" : "missing"})`,
  );
  console.log(
    `[project-agent-demo] tools configured: ${configuredTools.length > 0 ? configuredTools.join(", ") : "none"} | cliWorkdir=${toolConfig.cliWorkdir} codexWorkdir=${toolConfig.codexWorkdir} codexBridgeUrl=${toolConfig.codexBridgeUrl ?? "none"}`,
  );
  console.log(
    `[project-agent-demo] whatsapp gateway: enabled=${gatewayConfig.whatsapp.enabled} provider=${gatewayConfig.whatsapp.provider} authDir=${gatewayConfig.whatsapp.authDir}`,
  );
  console.log(`[project-agent-demo] logging flags: ${JSON.stringify(loggingFlags)}`);

  if (whatsappBaileysGateway && gatewayConfig.whatsapp.autoStart) {
    void whatsappBaileysGateway.start();
  }
});

const shutdown = async () => {
  if (whatsappBaileysGateway) {
    await whatsappBaileysGateway.stop();
  }
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
