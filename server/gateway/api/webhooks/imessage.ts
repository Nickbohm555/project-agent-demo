import { Router } from "express";
import type { GatewayRouter } from "../../core/router.js";
import { parseIMessageInbound } from "../../channels/imessage/inbound.js";
import type { IMessageAdapter } from "../../channels/imessage/adapter.js";

type BuildIMessageWebhookRouterOptions = {
  gatewayRouter: GatewayRouter;
  adapter?: IMessageAdapter;
};

export function buildIMessageWebhookRouter(options: BuildIMessageWebhookRouterOptions): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const inbound = parseIMessageInbound(req.body);

    for (const message of inbound) {
      const routeResult = await options.gatewayRouter.routeInbound(message);
      if (!routeResult.assistantText || !options.adapter || routeResult.skipped) {
        continue;
      }

      await options.adapter.sendOutbound({
        id: `outbound-${message.id}`,
        channel: "imessage",
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

