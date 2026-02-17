import cors from "cors";
import express from "express";
import { loadEnvironmentFromDotenv } from "./config/load-env.js";
import { buildRuntimeContext } from "./agent/runtimeFactory.js";
import { ChatService } from "./chat/chatService.js";
import { buildChatRouter } from "./chat/chatRouter.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const envResult = loadEnvironmentFromDotenv();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const { runtime, sessionStore, modelConfig } = buildRuntimeContext();
const chatService = new ChatService(runtime);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    runtime: runtime.name,
    model: `${modelConfig.provider}/${modelConfig.modelId}`,
    thinkingLevel: modelConfig.thinkingLevel,
    hasRequiredApiKey: modelConfig.hasRequiredApiKey,
  });
});

app.get("/api/agents/sessions", (_req, res) => {
  res.json({ sessions: sessionStore.list() });
});

app.get("/api/agent/runtime", (_req, res) => {
  res.json({
    runtime: runtime.name,
    modelConfig,
  });
});

app.use("/api/chat", buildChatRouter(chatService));

app.listen(port, () => {
  console.log(
    `[project-agent-demo] server listening on http://localhost:${port} (runtime=${runtime.name}, dotenv=${envResult.loaded ? "loaded" : "missing"})`,
  );
});
