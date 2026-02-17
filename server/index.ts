import cors from "cors";
import express from "express";
import { buildRuntime } from "./agent/runtimeFactory.js";
import { ChatService } from "./chat/chatService.js";
import { buildChatRouter } from "./chat/chatRouter.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const runtime = buildRuntime();
const chatService = new ChatService(runtime);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, runtime: runtime.name });
});

app.use("/api/chat", buildChatRouter(chatService));

app.listen(port, () => {
  console.log(`[project-agent-demo] server listening on http://localhost:${port} (runtime=${runtime.name})`);
});
