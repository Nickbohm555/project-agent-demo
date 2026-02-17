import { Router } from "express";
import { z } from "zod";
import type { ChatService } from "./chatService.js";

const sendRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export function buildChatRouter(chatService: ChatService): Router {
  const router = Router();

  router.get("/history", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "demo-session");
    const session = chatService.getSession(sessionId);
    res.json(session);
  });

  router.post("/send", async (req, res) => {
    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request payload", details: parsed.error.issues });
      return;
    }

    const result = await chatService.sendMessage(parsed.data.sessionId, parsed.data.message);
    res.json(result);
  });

  return router;
}
