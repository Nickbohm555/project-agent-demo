import { Router } from "express";
import { z } from "zod";
import type { GatewayRouter } from "../../core/router.js";
import { parseWhatsAppInbound } from "../../channels/whatsapp/inbound.js";
import type { WhatsAppAdapter } from "../../channels/whatsapp/adapter.js";

const verificationQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional(),
});

type BuildWhatsAppWebhookRouterOptions = {
  gatewayRouter: GatewayRouter;
  adapter?: WhatsAppAdapter;
  verifyToken?: string;
};

export function buildWhatsAppWebhookRouter(options: BuildWhatsAppWebhookRouterOptions): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const parsed = verificationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid verification query params" });
      return;
    }

    if (!options.verifyToken) {
      res.status(501).json({ error: "verify token is not configured" });
      return;
    }

    const mode = parsed.data["hub.mode"];
    const verifyToken = parsed.data["hub.verify_token"];
    const challenge = parsed.data["hub.challenge"];

    if (mode === "subscribe" && verifyToken === options.verifyToken && challenge) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).json({ error: "verification failed" });
  });

  router.post("/", async (req, res) => {
    const inbound = parseWhatsAppInbound(req.body);
    for (const message of inbound) {
      const routeResult = await options.gatewayRouter.routeInbound(message);
      if (!routeResult.assistantText || !options.adapter || routeResult.skipped) {
        continue;
      }

      await options.adapter.sendOutbound({
        id: `outbound-${message.id}`,
        channel: "whatsapp",
        conversationId: message.conversationId,
        userId: "assistant",
        text: routeResult.assistantText,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ ok: true, received: inbound.length });
  });

  return router;
}

