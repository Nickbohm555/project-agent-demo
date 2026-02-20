import { Router } from "express";
import { z } from "zod";
import type { ChatEventBus } from "./chatEvents.js";
import type { ChatService } from "./chatService.js";

const sendRequestSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export function buildChatRouter(chatService: ChatService, events: ChatEventBus): Router {
  const router = Router();

  router.get("/stream", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    const safeWrite = (chunk: string): boolean => {
      if (closed || res.destroyed || res.writableEnded) {
        return false;
      }
      try {
        res.write(chunk);
        return true;
      } catch {
        return false;
      }
    };

    const sendEvent = (payload: unknown) => {
      safeWrite(`data: ${JSON.stringify(payload)}\\n\\n`);
    };

    const unsubscribe = events.subscribe(sessionId, (event) => {
      sendEvent(event);
    });

    const keepAlive = setInterval(() => {
      safeWrite(":keepalive\\n\\n");
    }, 20_000);

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  });

  router.get("/history", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "demo-session");
    const session = chatService.getSession(sessionId);
    res.json(session);
  });

  router.get("/tool-log", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    res.json({ entries: events.getToolLog(sessionId) });
  });

  router.delete("/tool-log", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    events.clearToolLog(sessionId);
    res.json({ ok: true });
  });

  router.post("/send", async (req, res) => {
    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request payload", details: parsed.error.issues });
      return;
    }

    try {
      const result = await chatService.sendMessage(
        parsed.data.agentId,
        parsed.data.sessionId,
        parsed.data.message,
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to send message", details: String(err) });
    }
  });

  return router;
}
